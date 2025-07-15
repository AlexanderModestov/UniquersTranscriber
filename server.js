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
      'audio/ogg', 'video/webm'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload and transcribe single file
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const baseName = path.parse(originalName).name;

    // Upload to AssemblyAI
    const audioFile = await client.files.upload(filePath);
    
    // Create transcription
    const transcript = await client.transcripts.create({
      audio: audioFile,
      speaker_labels: true
    });

    // Wait for completion
    let finalTranscript = await client.transcripts.wait(transcript.id);

    // Save transcription to file
    const transcriptionPath = path.join(transcriptionsDir, `${baseName}.txt`);
    await fs.writeFile(transcriptionPath, finalTranscript.text);

    // Clean up uploaded file
    await fs.remove(filePath);

    res.json({
      success: true,
      transcription: finalTranscript.text,
      filename: `${baseName}.txt`,
      downloadUrl: `/download/${encodeURIComponent(`${baseName}.txt`)}`
    });

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// Batch upload and transcribe
app.post('/upload/batch', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const filePath = file.path;
        const originalName = file.originalname;
        const baseName = path.parse(originalName).name;

        // Upload to AssemblyAI
        const audioFile = await client.files.upload(filePath);
        
        // Create transcription
        const transcript = await client.transcripts.create({
          audio: audioFile,
          speaker_labels: true
        });

        // Wait for completion
        const finalTranscript = await client.transcripts.wait(transcript.id);

        // Save transcription to file
        const transcriptionPath = path.join(transcriptionsDir, `${baseName}.txt`);
        await fs.writeFile(transcriptionPath, finalTranscript.text);

        // Clean up uploaded file
        await fs.remove(filePath);

        results.push({
          originalName,
          transcription: finalTranscript.text,
          filename: `${baseName}.txt`,
          downloadUrl: `/download/${encodeURIComponent(`${baseName}.txt`)}`
        });

      } catch (error) {
        console.error(`Error processing ${file.originalname}:`, error);
        errors.push({
          filename: file.originalname,
          error: error.message
        });
        
        // Clean up file on error
        await fs.remove(file.path).catch(() => {});
      }
    }

    res.json({
      success: true,
      results,
      errors,
      totalProcessed: results.length,
      totalErrors: errors.length
    });

  } catch (error) {
    console.error('Batch transcription error:', error);
    res.status(500).json({ 
      error: 'Batch transcription failed', 
      details: error.message 
    });
  }
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