const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { AssemblyAI } = require('assemblyai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize AssemblyAI client
const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const transcriptionsDir = path.join(__dirname, 'transcriptions');
const tempDir = path.join(__dirname, 'temp');

[uploadsDir, transcriptionsDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac',
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv',
      'audio/ogg', 'video/webm', 'audio/x-m4a', 'video/x-msvideo',
      'audio/mp4', 'video/quicktime', 'audio/x-wav', 'audio/wave',
      'audio/x-aac', 'application/octet-stream'
    ];
    
    const allowedExtensions = [
      '.mp3', '.wav', '.m4a', '.aac', '.mp4', '.avi', '.mov', 
      '.wmv', '.flv', '.ogg', '.webm'
    ];
    
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype} (${file.originalname})`), false);
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload and transcribe single file
app.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message });
    }
    
    try {
      console.log('=== Starting upload workflow ===');
      
      if (!req.file) {
        console.log('ERROR: No file uploaded');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filePath = req.file.path;
      const originalName = req.file.originalname;
      const baseName = path.parse(originalName).name;

      console.log('STEP 1: File received:', {
        originalName,
        filePath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      });
      
      // Upload to AssemblyAI
      console.log('STEP 2: Uploading file to AssemblyAI...');
      const audioFile = await client.files.upload(filePath);
      console.log('STEP 2: File uploaded successfully to AssemblyAI:', {
        uploadUrl: audioFile,
        fileName: originalName
      });
      
      // Create transcription
      console.log('STEP 3: Creating transcription request...');
      const transcript = await client.transcripts.create({
        audio_url: audioFile,
        language_code: 'ru',
        speaker_labels: true,
        speakers_expected: 2
      });
      console.log('STEP 3: Transcription request created:', {
        transcriptId: transcript.id,
        status: transcript.status
      });

      // Wait for completion
      console.log('STEP 4: Waiting for transcription to complete...');
      let finalTranscript = await client.transcripts.waitUntilReady(transcript.id);
      console.log('STEP 4: Transcription completed:', {
        transcriptId: finalTranscript.id,
        status: finalTranscript.status,
        textLength: finalTranscript.text?.length || 0
      });

      // Save transcription to file
      console.log('STEP 5: Saving transcription to file...');
      const transcriptionPath = path.join(transcriptionsDir, `${baseName}.txt`);
      const speakerPath = path.join(transcriptionsDir, `${baseName}_speakers.txt`);
      const timestampPath = path.join(transcriptionsDir, `${baseName}_timestamps.txt`);
      const jsonPath = path.join(transcriptionsDir, `${baseName}_full.json`);
      
      // Save plain text
      await fs.writeFile(transcriptionPath, finalTranscript.text);
      
      // Save speaker-separated transcription with timestamps
      if (finalTranscript.utterances && finalTranscript.utterances.length > 0) {
        const speakerText = finalTranscript.utterances
          .map(utterance => `Speaker ${utterance.speaker}: ${utterance.text}`)
          .join('\n\n');
        await fs.writeFile(speakerPath, speakerText);
        
        // Save timestamps format for video discussions
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
        
        console.log('STEP 5: Speaker transcription saved to:', speakerPath);
        console.log('STEP 5: Timestamp transcription saved to:', timestampPath);
      }
      
      // Save full JSON with all data for future summarization
      const fullData = {
        text: finalTranscript.text,
        utterances: finalTranscript.utterances,
        words: finalTranscript.words,
        confidence: finalTranscript.confidence,
        audio_duration: finalTranscript.audio_duration
      };
      await fs.writeFile(jsonPath, JSON.stringify(fullData, null, 2));
      console.log('STEP 5: Full JSON data saved to:', jsonPath);
      
      console.log('STEP 5: Transcription saved to:', transcriptionPath);

      // Clean up uploaded file
      console.log('STEP 6: Cleaning up uploaded file...');
      await fs.remove(filePath);
      console.log('STEP 6: Uploaded file cleaned up');

      console.log('=== Upload workflow completed successfully ===');
      res.json({
        success: true,
        message: 'Transcription completed successfully',
        originalFilename: originalName,
        files: {
          transcript: {
            filename: `${baseName}.txt`,
            downloadUrl: `/download/${encodeURIComponent(`${baseName}.txt`)}`
          },
          speakers: {
            filename: `${baseName}_speakers.txt`,
            downloadUrl: `/download/${encodeURIComponent(`${baseName}_speakers.txt`)}`
          },
          timestamps: {
            filename: `${baseName}_timestamps.txt`,
            downloadUrl: `/download/${encodeURIComponent(`${baseName}_timestamps.txt`)}`
          },
          fullData: {
            filename: `${baseName}_full.json`,
            downloadUrl: `/download/${encodeURIComponent(`${baseName}_full.json`)}`
          }
        }
      });

    } catch (err) {
      console.error('Upload error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name,
        code: err.code,
        fileName: req.file?.originalname || 'unknown'
      });
      
      // Clean up uploaded file on error
      if (req.file && req.file.path) {
        await fs.remove(req.file.path).catch(cleanupErr => {
          console.error('Failed to clean up file after error:', cleanupErr);
        });
      }
      
      res.status(500).json({ 
        error: 'Internal Server Error', 
        details: err.message,
        code: err.code || 'UNKNOWN_ERROR',
        fileName: req.file?.originalname || 'unknown'
      });
    }
  });
});

// Batch upload and transcribe
app.post('/upload/batch', (req, res) => {
  upload.array('files', 10)(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message });
    }
    
    try {
      console.log('=== Starting batch upload workflow ===');
      
      if (!req.files || req.files.length === 0) {
        console.log('ERROR: No files uploaded');
        return res.status(400).json({ error: 'No files uploaded' });
      }

      console.log('BATCH STEP 1: Files received:', {
        filesCount: req.files.length,
        fileNames: req.files.map(f => f.originalname)
      });

      const results = [];
      const errors = [];

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const fileNum = i + 1;
        
        try {
          console.log(`--- Processing file ${fileNum}/${req.files.length}: ${file.originalname} ---`);
          
          const filePath = file.path;
          const originalName = file.originalname;
          const baseName = path.parse(originalName).name;

          console.log(`File ${fileNum} - STEP 1: File details:`, {
            originalName,
            filePath,
            fileSize: file.size,
            mimeType: file.mimetype
          });

          // Upload to AssemblyAI
          console.log(`File ${fileNum} - STEP 2: Uploading to AssemblyAI...`);
          const audioFile = await client.files.upload(filePath);
          console.log(`File ${fileNum} - STEP 2: Uploaded successfully:`, audioFile);
          
          // Create transcription
          console.log(`File ${fileNum} - STEP 3: Creating transcription...`);
          const transcript = await client.transcripts.create({
            audio_url: audioFile,
            language_code: 'ru',
            speaker_labels: true,
            speakers_expected: 2
          });
          console.log(`File ${fileNum} - STEP 3: Transcription created:`, transcript.id);

          // Wait for completion
          console.log(`File ${fileNum} - STEP 4: Waiting for completion...`);
          const finalTranscript = await client.transcripts.waitUntilReady(transcript.id);
          console.log(`File ${fileNum} - STEP 4: Completed:`, finalTranscript.status);

          // Save transcription to file
          console.log(`File ${fileNum} - STEP 5: Saving transcription...`);
          const transcriptionPath = path.join(transcriptionsDir, `${baseName}.txt`);
          const speakerPath = path.join(transcriptionsDir, `${baseName}_speakers.txt`);
          const timestampPath = path.join(transcriptionsDir, `${baseName}_timestamps.txt`);
          const jsonPath = path.join(transcriptionsDir, `${baseName}_full.json`);
          
          // Save plain text
          await fs.writeFile(transcriptionPath, finalTranscript.text);
          
          // Save speaker-separated transcription with timestamps
          if (finalTranscript.utterances && finalTranscript.utterances.length > 0) {
            const speakerText = finalTranscript.utterances
              .map(utterance => `Speaker ${utterance.speaker}: ${utterance.text}`)
              .join('\n\n');
            await fs.writeFile(speakerPath, speakerText);
            
            // Save timestamps format for video discussions
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
            
            console.log(`File ${fileNum} - STEP 5: Speaker transcription saved to:`, speakerPath);
            console.log(`File ${fileNum} - STEP 5: Timestamp transcription saved to:`, timestampPath);
          }
          
          // Save full JSON with all data for future summarization
          const fullData = {
            text: finalTranscript.text,
            utterances: finalTranscript.utterances,
            words: finalTranscript.words,
            confidence: finalTranscript.confidence,
            audio_duration: finalTranscript.audio_duration
          };
          await fs.writeFile(jsonPath, JSON.stringify(fullData, null, 2));
          console.log(`File ${fileNum} - STEP 5: Full JSON data saved to:`, jsonPath);
          
          console.log(`File ${fileNum} - STEP 5: Saved to:`, transcriptionPath);

          // Clean up uploaded file
          console.log(`File ${fileNum} - STEP 6: Cleaning up...`);
          await fs.remove(filePath);
          console.log(`File ${fileNum} - STEP 6: Cleaned up`);

          results.push({
            originalFilename: originalName,
            files: {
              transcript: {
                filename: `${baseName}.txt`,
                downloadUrl: `/download/${encodeURIComponent(`${baseName}.txt`)}`
              },
              speakers: {
                filename: `${baseName}_speakers.txt`,
                downloadUrl: `/download/${encodeURIComponent(`${baseName}_speakers.txt`)}`
              },
              timestamps: {
                filename: `${baseName}_timestamps.txt`,
                downloadUrl: `/download/${encodeURIComponent(`${baseName}_timestamps.txt`)}`
              },
              fullData: {
                filename: `${baseName}_full.json`,
                downloadUrl: `/download/${encodeURIComponent(`${baseName}_full.json`)}`
              }
            }
          });

          console.log(`File ${fileNum} - SUCCESS: ${originalName} processed successfully`);

        } catch (error) {
          console.error(`File ${fileNum} - ERROR processing ${file.originalname}:`, {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code
          });
          
          errors.push({
            filename: file.originalname,
            error: error.message
          });
          
          // Clean up file on error
          await fs.remove(file.path).catch(cleanupErr => {
            console.error(`Failed to clean up file ${file.originalname}:`, cleanupErr);
          });
        }
      }

    console.log('=== Batch upload workflow completed ===', {
      totalFiles: req.files.length,
      successfulFiles: results.length,
      failedFiles: errors.length,
      successRate: `${Math.round((results.length / req.files.length) * 100)}%`
    });

    res.json({
      success: true,
      results,
      errors,
      totalProcessed: results.length,
      totalErrors: errors.length
    });

    } catch (error) {
      console.error('Batch transcription error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
        filesCount: req.files?.length || 0
      });
      
      // Clean up any uploaded files on error
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await fs.remove(file.path).catch(cleanupErr => {
            console.error(`Failed to clean up file ${file.originalname}:`, cleanupErr);
          });
        }
      }
      
      res.status(500).json({ 
        error: 'Batch transcription failed', 
        details: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        filesCount: req.files?.length || 0
      });
    }
  });
});

// Download transcription file
app.get('/download/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(transcriptionsDir, filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Get transcription status
app.get('/status/:transcriptId', async (req, res) => {
  try {
    const transcript = await client.transcripts.get(req.params.transcriptId);
    res.json({
      id: transcript.id,
      status: transcript.status,
      text: transcript.text || null,
      error: transcript.error || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status', details: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error', details: error.message });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 