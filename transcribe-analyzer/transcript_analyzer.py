#!/usr/bin/env python3
"""
Transcript Analyzer - Transform multi-speaker transcripts into single-speaker summaries.

This script processes _timestamps.txt files from transcriptions/audio_* folders,
identifies the primary speaker (highest word count), and creates summaries
focused on their content while preserving question-answer context.
"""

import os
import re
import glob
from collections import defaultdict, Counter
from pathlib import Path
import argparse
import openai
from typing import List, Dict, Optional
import json


class TranscriptAnalyzer:
    def __init__(self, transcriptions_dir="transcriptions", openai_api_key=None):
        self.transcriptions_dir = transcriptions_dir
        self.client = None
        
        # Initialize OpenAI client if API key is provided
        if openai_api_key:
            self.client = openai.OpenAI(api_key=openai_api_key)
        elif os.getenv('OPENAI_API_KEY'):
            self.client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        
    def find_timestamp_files(self):
        """Recursively find all *timestamps.txt files in all subdirectories."""
        # Search recursively for any *timestamps.txt files in the root directory
        pattern = os.path.join(self.transcriptions_dir, "**", "*timestamps.txt")
        return glob.glob(pattern, recursive=True)
    
    def parse_transcript(self, file_path):
        """Parse a timestamp file and extract speaker segments."""
        segments = []
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Pattern to match: [timestamp] Speaker X: text
        pattern = r'\[([^\]]+)\]\s+Speaker\s+([A-Z]+):\s*(.*?)(?=\n\s*\[|$)'
        matches = re.findall(pattern, content, re.DOTALL)
        
        for timestamp, speaker, text in matches:
            # Clean up text (remove extra whitespace and newlines)
            cleaned_text = ' '.join(text.strip().split())
            if cleaned_text:  # Only add non-empty segments
                segments.append({
                    'timestamp': timestamp,
                    'speaker': speaker,
                    'text': cleaned_text
                })
        
        return segments
    
    def identify_primary_speaker(self, segments):
        """Identify primary speaker by total word count."""
        speaker_word_counts = defaultdict(int)
        
        for segment in segments:
            word_count = len(segment['text'].split())
            speaker_word_counts[segment['speaker']] += word_count
        
        if not speaker_word_counts:
            return None
        
        primary_speaker = max(speaker_word_counts.items(), key=lambda x: x[1])[0]
        return primary_speaker
    
    def extract_primary_content(self, segments, primary_speaker):
        """Extract content from primary speaker with context preservation."""
        result = []
        
        for i, segment in enumerate(segments):
            if segment['speaker'] == primary_speaker:
                # Look for preceding questions or context
                context = []
                
                # Look back up to 2 segments for questions/context
                for j in range(max(0, i-2), i):
                    prev_segment = segments[j]
                    if prev_segment['speaker'] != primary_speaker:
                        prev_text = prev_segment['text']
                        # Check if it looks like a question or relevant context
                        if ('?' in prev_text or 
                            len(prev_text.split()) < 20 or  # Short statements often setup context
                            any(word in prev_text.lower() for word in ['вопрос', 'скажи', 'расскажи', 'как', 'что', 'почему', 'когда'])):
                            context.append({
                                'speaker': prev_segment['speaker'],
                                'text': prev_text,
                                'timestamp': prev_segment['timestamp']
                            })
                
                result.append({
                    'timestamp': segment['timestamp'],
                    'context': context,
                    'primary_text': segment['text']
                })
        
        return result
    
    def extract_plain_text_for_rag(self, primary_content: List[Dict], primary_speaker: str) -> str:
        """Extract clean plain text from the main person for RAG system."""
        text_parts = []
        
        for item in primary_content:
            # Include context questions for better understanding
            if item['context']:
                for ctx in item['context']:
                    if '?' in ctx['text'] or any(word in ctx['text'].lower() for word in ['вопрос', 'скажи', 'расскажи', 'как', 'что', 'почему', 'когда']):
                        text_parts.append(ctx['text'])
            
            # Add the main person's response
            text_parts.append(item['primary_text'])
        
        return "\n\n".join(text_parts)

    def get_full_transcript_with_timestamps(self, file_path: str) -> str:
        """Get the full transcript with timestamps for ChatGPT processing."""
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read().strip()

    def analyze_with_chatgpt(self, primary_content: List[Dict], primary_speaker: str, file_path: str) -> Optional[str]:
        """Use ChatGPT to extract expert content using the specific prompt format."""
        if not self.client:
            return None
        
        # Get the full transcript with timestamps
        full_transcript = self.get_full_transcript_with_timestamps(file_path)
        
        # Create the specific prompt format
        prompt = f"""Task
You are given a Russian transcript where each line is formatted as:

[MM:SS] Speaker X: …text…

Task: Extract only the expert’s speech (the speaker exactly matching {primary_speaker}), preserving their original style while presenting a clear and concise description of the problem and solution. The final result must be a continuous plain text with no skipped-line gaps.

Deterministic Rules (apply in order):

Identify expert turns:

Any line where the speaker equals {primary_speaker} is an expert turn.

Merge consecutive expert turns (no intervening non-expert speech) into a single reply, concatenating their text with a single space. Preserve original wording and punctuation.

Context merging:

If expert turns are separated only by empty or filler lines, treat them as consecutive and merge them.

Filler detection (for non-experts):

Skip a non-expert line if:

It contains fewer than 3 content words (after removing hesitation tokens), OR

More than 70% of its tokens are hesitation tokens.

Content words = Cyrillic word tokens excluding hesitation tokens.

Hesitation tokens (remove wherever they appear):

«эээ», «эм», «ну», «угу», «да», «ага», «вот», «как бы», «в общем», «короче», «ладно».

Cleaning rules:

Remove timestamps ([MM:SS]) and speaker labels (Speaker X:).

Remove hesitation tokens completely.

Normalize spaces (collapse multiple spaces, trim edges).

Preserve original language and punctuation.

Output format (plain text only):

Output each expert reply block in chronological order as continuous plain text.

Do not leave empty lines between blocks, even if some parts were skipped.

The result must clearly present the problem and the expert’s solution in their natural style.

Do not add any extra text, labels, numbering, or explanations.

Edge cases:

If no expert turns exist, output nothing.

Input:
{full_transcript}"""
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4.1-2025-04-14",
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=3000,
                temperature=0.1
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            print(f"  Error calling ChatGPT API: {str(e)}")
            return None

    def generate_summary(self, primary_content, primary_speaker, file_path):
        """Generate plain text content from primary speaker for RAG system."""
        # Try to get AI-cleaned version first using the specific prompt
        if self.client:
            cleaned_text = self.analyze_with_chatgpt(primary_content, primary_speaker, file_path)
            if cleaned_text:
                return cleaned_text
        
        # Fallback to simple plain text extraction
        return self.extract_plain_text_for_rag(primary_content, primary_speaker)
    
    def save_summary(self, summary, input_file_path):
        """Save summary to output file."""
        # Generate output filename
        input_dir = os.path.dirname(input_file_path)
        input_basename = os.path.basename(input_file_path)
        
        # Remove _timestamps.txt suffix to get base name
        base_name = input_basename.replace('_timestamps.txt', '')
        output_filename = f"{base_name}_rag_content.txt"
        output_path = os.path.join(input_dir, output_filename)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(summary)
        
        return output_path
    
    def process_file(self, file_path):
        """Process a single timestamp file."""
        print(f"Processing: {file_path}")
        
        try:
            # Parse transcript
            segments = self.parse_transcript(file_path)
            if not segments:
                print(f"  No segments found in {file_path}")
                return None
            
            # Identify primary speaker
            primary_speaker = self.identify_primary_speaker(segments)
            if not primary_speaker:
                print(f"  No primary speaker identified in {file_path}")
                return None
            
            print(f"  Primary speaker: {primary_speaker}")
            
            # Extract primary content
            primary_content = self.extract_primary_content(segments, primary_speaker)
            if not primary_content:
                print(f"  No content from primary speaker in {file_path}")
                return None
            
            # Generate summary
            summary = self.generate_summary(primary_content, primary_speaker, file_path)
            
            # Save RAG content
            output_path = self.save_summary(summary, file_path)
            print(f"  RAG content saved to: {output_path}")
            
            return output_path
            
        except Exception as e:
            print(f"  Error processing {file_path}: {str(e)}")
            return None
    
    def process_all(self):
        """Process all timestamp files."""
        timestamp_files = self.find_timestamp_files()
        
        if not timestamp_files:
            print(f"No timestamp files found in {self.transcriptions_dir}")
            return []
        
        print(f"Found {len(timestamp_files)} timestamp files to process")
        
        results = []
        for file_path in timestamp_files:
            result = self.process_file(file_path)
            if result:
                results.append(result)
        
        print(f"\nProcessing complete. Generated {len(results)} RAG content files.")
        return results


def main():
    parser = argparse.ArgumentParser(description='Extract clean plain text from main person for RAG system')
    parser.add_argument('--transcriptions-dir', '-d', default='transcriptions',
                        help='Directory containing audio_* folders with timestamp files')
    parser.add_argument('--file', '-f', help='Process a specific timestamp file')
    parser.add_argument('--openai-key', help='OpenAI API key for ChatGPT analysis')
    
    args = parser.parse_args()
    
    analyzer = TranscriptAnalyzer(args.transcriptions_dir, args.openai_key)
    
    if args.file:
        # Process single file
        if os.path.exists(args.file):
            analyzer.process_file(args.file)
        else:
            print(f"File not found: {args.file}")
    else:
        # Process all files
        analyzer.process_all()


if __name__ == "__main__":
    main()