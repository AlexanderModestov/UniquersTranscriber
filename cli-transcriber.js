#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { AssemblyAI } = require('assemblyai');
const ffmpeg = require('fluent-ffmpeg');
const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
require('dotenv').config();

// Initialize AssemblyAI client
const apiKey = process.env.ASSEMBLYAI_API_KEY;
if (!apiKey) {
  console.error(chalk.red('❌ Error: ASSEMBLYAI_API_KEY not found in environment variables'));
  console.log(chalk.yellow('💡 Please set your AssemblyAI API key in the .env file'));
  process.exit(1);
}

const client = new AssemblyAI({ apiKey });
const transcriptionsDir = path.join(__dirname, 'transcriptions');
const tempDir = path.join(__dirname, 'temp');

// Ensure directories exist
[transcriptionsDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// File type detection
const isVideoFile = (filePath) => {
  const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];
  const fileExtension = path.extname(filePath).toLowerCase();
  return videoExtensions.includes(fileExtension);
};

const isAudioFile = (filePath) => {
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma'];
  const fileExtension = path.extname(filePath).toLowerCase();
  return audioExtensions.includes(fileExtension);
};

// Check if FFmpeg is available
const checkFFmpegAvailability = () => {
  try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
};

// Extract audio from video file
const extractAudioFromVideo = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    const spinner = ora('Extracting audio from video...').start();
    
    if (!checkFFmpegAvailability()) {
      spinner.fail('FFmpeg not available');
      reject(new Error('FFmpeg is not installed. Please install FFmpeg: sudo apt-get install ffmpeg (Ubuntu/Debian) or brew install ffmpeg (macOS)'));
      return;
    }
    
    ffmpeg(inputPath)
      .audioCodec('aac')
      .audioChannels(2)
      .audioFrequency(44100)
      .format('mp4')
      .on('start', (commandLine) => {
        spinner.text = 'Extracting audio from video...';
      })
      .on('progress', (progress) => {
        const percent = Math.round(progress.percent || 0);
        spinner.text = `Extracting audio from video... ${percent}%`;
      })
      .on('end', () => {
        spinner.succeed('Audio extraction completed');
        resolve(outputPath);
      })
      .on('error', (err) => {
        spinner.fail('Audio extraction failed');
        reject(new Error(`Audio extraction failed: ${err.message}`));
      })
      .save(outputPath);
  });
};

// Process a single file
const processFile = async (filePath, options = {}) => {
  try {
    console.log(chalk.blue(`\n🎵 Processing: ${path.basename(filePath)}`));
    
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Validate file type
    if (!isAudioFile(filePath) && !isVideoFile(filePath)) {
      throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
    }
    
    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);
    console.log(chalk.gray(`📁 File size: ${fileSizeMB} MB`));
    
    let audioFilePath = filePath;
    const originalName = path.basename(filePath);
    const baseName = path.parse(originalName).name;
    
    // Extract audio from video if needed
    if (isVideoFile(filePath)) {
      console.log(chalk.yellow('🎬 Video file detected'));
      const audioFileName = `${baseName}_audio.m4a`;
      audioFilePath = path.join(tempDir, audioFileName);
      
      try {
        await extractAudioFromVideo(filePath, audioFilePath);
      } catch (extractError) {
        throw new Error(`Failed to extract audio from video: ${extractError.message}`);
      }
    }
    
    // Upload to AssemblyAI
    const uploadSpinner = ora('Uploading file to AssemblyAI...').start();
    try {
      const audioFile = await client.files.upload(audioFilePath);
      uploadSpinner.succeed('File uploaded to AssemblyAI');
      console.log(chalk.gray(`🔗 Upload URL: ${audioFile}`));
    } catch (uploadError) {
      uploadSpinner.fail('Upload failed');
      throw new Error(`Upload failed: ${uploadError.message}`);
    }
    
    // Create transcription
    const transcribeSpinner = ora('Creating transcription request...').start();
    let transcript;
    try {
      const transcriptionConfig = {
        audio_url: await client.files.upload(audioFilePath),
        language_code: options.language || 'ru',
        speaker_labels: true
        // speakers_expected: options.speakers || 2,  // Remove this line
      };
      
      // Add additional options if specified
      if (options.punctuate !== undefined) transcriptionConfig.punctuate = options.punctuate;
      if (options.formatText !== undefined) transcriptionConfig.format_text = options.formatText;
      if (options.dualChannel !== undefined) transcriptionConfig.dual_channel = options.dualChannel;
      
      transcript = await client.transcripts.create(transcriptionConfig);
      transcribeSpinner.succeed('Transcription request created');
      console.log(chalk.gray(`🆔 Transcript ID: ${transcript.id}`));
    } catch (createError) {
      transcribeSpinner.fail('Transcription request failed');
      throw new Error(`Transcription request failed: ${createError.message}`);
    }
    
    // Wait for completion with progress
    const progressSpinner = ora('Transcription in progress...').start();
    try {
      let finalTranscript = transcript;
      
      // Poll for completion
      while (finalTranscript.status === 'queued' || finalTranscript.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        finalTranscript = await client.transcripts.get(transcript.id);
        
        if (finalTranscript.status === 'processing') {
          progressSpinner.text = 'Transcription in progress... (processing audio)';
        } else if (finalTranscript.status === 'queued') {
          progressSpinner.text = 'Transcription in progress... (queued)';
        }
      }
      
      if (finalTranscript.status === 'error') {
        progressSpinner.fail('Transcription failed');
        throw new Error(`Transcription failed: ${finalTranscript.error}`);
      }
      
      progressSpinner.succeed('Transcription completed');
      console.log(chalk.green(`✅ Status: ${finalTranscript.status}`));
      console.log(chalk.gray(`⏱️  Duration: ${Math.round(finalTranscript.audio_duration / 1000)}s`));
      console.log(chalk.gray(`📝 Confidence: ${(finalTranscript.confidence * 100).toFixed(1)}%`));
      
      // Save transcription files
      const saveSpinner = ora('Saving transcription files...').start();
      
      const fileTranscriptionsDir = path.join(transcriptionsDir, baseName);
      if (!fs.existsSync(fileTranscriptionsDir)) {
        fs.mkdirSync(fileTranscriptionsDir, { recursive: true });
      }
      
      const transcriptionPath = path.join(fileTranscriptionsDir, `${baseName}.txt`);
      const speakerPath = path.join(fileTranscriptionsDir, `${baseName}_speakers.txt`);
      const timestampPath = path.join(fileTranscriptionsDir, `${baseName}_timestamps.txt`);
      const jsonPath = path.join(fileTranscriptionsDir, `${baseName}_full.json`);
      
      // Save plain text
      await fs.writeFile(transcriptionPath, finalTranscript.text);
      
      // Save speaker-separated transcription with timestamps
      if (finalTranscript.utterances && finalTranscript.utterances.length > 0) {
        const speakerText = finalTranscript.utterances
          .map(utterance => `Speaker ${utterance.speaker}: ${utterance.text}`)
          .join('\n\n');
        await fs.writeFile(speakerPath, speakerText);
        
        // Save timestamps format
        const timestampText = finalTranscript.utterances
          .map(utterance => {
            const startTime = Math.floor(utterance.start / 1000);
            const startMinutes = Math.floor(startTime / 60);
            const startSeconds = startTime % 60;
            const timeFormat = `${startMinutes}:${startSeconds.toString().padStart(2, '0')}`;
            return `[${timeFormat}] Speaker ${utterance.speaker}: ${utterance.text}`;
          })
          .join('\n\n');
        await fs.writeFile(timestampPath, timestampText);
      }
      
      // Save full JSON data
      const fullData = {
        text: finalTranscript.text,
        utterances: finalTranscript.utterances,
        words: finalTranscript.words,
        confidence: finalTranscript.confidence,
        audio_duration: finalTranscript.audio_duration,
        language_code: finalTranscript.language_code
      };
      await fs.writeFile(jsonPath, JSON.stringify(fullData, null, 2));
      
      saveSpinner.succeed('Files saved successfully');
      
      // Display file locations
      console.log(chalk.green('\n📄 Generated files:'));
      console.log(chalk.cyan(`   • Plain text: ${transcriptionPath}`));
      console.log(chalk.cyan(`   • Speakers: ${speakerPath}`));
      console.log(chalk.cyan(`   • Timestamps: ${timestampPath}`));
      console.log(chalk.cyan(`   • Full data: ${jsonPath}`));
      
      // Clean up extracted audio file
      if (audioFilePath !== filePath) {
        await fs.remove(audioFilePath).catch(() => {});
      }
      
      return {
        success: true,
        files: {
          transcript: transcriptionPath,
          speakers: speakerPath,
          timestamps: timestampPath,
          fullData: jsonPath
        }
      };
      
    } catch (progressError) {
      progressSpinner.fail('Transcription failed');
      throw progressError;
    }
    
  } catch (error) {
    console.error(chalk.red(`❌ Error processing ${path.basename(filePath)}: ${error.message}`));
    return { success: false, error: error.message };
  }
};

// Process multiple files
const processFiles = async (filePaths, options = {}) => {
  const results = [];
  const errors = [];
  
  console.log(chalk.blue(`\n🚀 Processing ${filePaths.length} file(s)...`));
  
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    console.log(chalk.yellow(`\n--- File ${i + 1}/${filePaths.length} ---`));
    
    const result = await processFile(filePath, options);
    
    if (result.success) {
      results.push({ file: filePath, ...result });
    } else {
      errors.push({ file: filePath, error: result.error });
    }
  }
  
  // Summary
  console.log(chalk.blue('\n📊 Processing Summary:'));
  console.log(chalk.green(`✅ Successful: ${results.length}`));
  console.log(chalk.red(`❌ Failed: ${errors.length}`));
  
  if (errors.length > 0) {
    console.log(chalk.red('\n💥 Errors:'));
    errors.forEach(({ file, error }) => {
      console.log(chalk.red(`   • ${path.basename(file)}: ${error}`));
    });
  }
  
  return { results, errors };
};

// CLI setup
program
  .name('cli-transcriber')
  .description('CLI utility for transcribing local audio/video files')
  .version('1.0.0');

program
  .command('transcribe')
  .description('Transcribe audio/video file(s)')
  .argument('<files...>', 'Path(s) to audio/video file(s)')
  .option('-l, --language <code>', 'Language code (default: ru)', 'ru')
  .option('-s, --speakers <number>', 'Expected number of speakers (default: 2)', '2')
  .option('--no-punctuate', 'Disable automatic punctuation')
  .option('--format-text', 'Enable text formatting')
  .option('--dual-channel', 'Process as dual channel audio')
  .action(async (files, options) => {
    // Validate files exist
    const validFiles = [];
    for (const file of files) {
      const fullPath = path.resolve(file);
      if (fs.existsSync(fullPath)) {
        validFiles.push(fullPath);
      } else {
        console.error(chalk.red(`❌ File not found: ${file}`));
      }
    }
    
    if (validFiles.length === 0) {
      console.error(chalk.red('❌ No valid files to process'));
      process.exit(1);
    }
    
    // Process files
    const processOptions = {
      language: options.language,
      speakers: parseInt(options.speakers),
      punctuate: options.punctuate,
      formatText: options.formatText,
      dualChannel: options.dualChannel
    };
    
    const startTime = Date.now();
    const { results, errors } = await processFiles(validFiles, processOptions);
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log(chalk.blue(`\n⏱️  Total processing time: ${duration}s`));
    
    if (results.length > 0) {
      console.log(chalk.green('\n🎉 Processing completed successfully!'));
      console.log(chalk.gray('💡 You can now run the transcript analyzer to generate summaries:'));
      console.log(chalk.cyan('   python3 transcribe-analyzer/transcript_analyzer.py'));
    }
    
    process.exit(errors.length > 0 ? 1 : 0);
  });

program
  .command('analyze')
  .description('Run transcript analyzer on completed transcriptions')
  .option('-f, --file <path>', 'Analyze specific timestamp file')
  .action(async (options) => {
    const { spawn } = require('child_process');
    
    console.log(chalk.blue('🔍 Running transcript analyzer...'));
    
    const args = ['transcribe-analyzer/transcript_analyzer.py'];
    if (options.file) {
      args.push('-f', options.file);
    }
    
    const analyzer = spawn('python3', args, { stdio: 'inherit' });
    
    analyzer.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('\n✅ Analysis completed successfully!'));
      } else {
        console.log(chalk.red(`\n❌ Analysis failed with code ${code}`));
      }
    });
  });

program
  .command('status')
  .description('Show current transcription status and files')
  .action(async () => {
    console.log(chalk.blue('📊 Transcription Status\n'));
    
    if (!fs.existsSync(transcriptionsDir)) {
      console.log(chalk.yellow('No transcriptions directory found'));
      return;
    }
    
    const dirs = fs.readdirSync(transcriptionsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    if (dirs.length === 0) {
      console.log(chalk.yellow('No transcriptions found'));
      return;
    }
    
    console.log(chalk.green(`Found ${dirs.length} transcription(s):`));
    
    dirs.forEach(dir => {
      const dirPath = path.join(transcriptionsDir, dir);
      const files = fs.readdirSync(dirPath);
      
      console.log(chalk.cyan(`\n📁 ${dir}:`));
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        const size = (stats.size / 1024).toFixed(1);
        console.log(chalk.gray(`   • ${file} (${size} KB)`));
      });
    });
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('❌ Invalid command. Use --help for available commands.'));
  process.exit(1);
});

// Show help if no arguments
if (process.argv.length <= 2) {
  program.help();
}

program.parse();