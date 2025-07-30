# Video File Processing Setup

## Overview
The UniquersTranscriber now supports video file uploads with automatic audio extraction for transcription.

## Supported Video Formats
- MP4 (.mp4)
- AVI (.avi)  
- MOV (.mov)
- WMV (.wmv)
- FLV (.flv)
- WebM (.webm)

## How It Works

### For Video Files:
1. **Upload**: User uploads a video file through the web interface
2. **Detection**: System automatically detects if the uploaded file is a video
3. **Audio Extraction**: FFmpeg extracts audio from the video file to M4A format
4. **Transcription**: The extracted audio is sent to AssemblyAI for transcription
5. **Cleanup**: Both original video and extracted audio files are removed after processing

### For Audio Files:
- Audio files are processed directly without extraction (existing functionality)

## FFmpeg Installation

### Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

### macOS:
```bash
brew install ffmpeg
```

### CentOS/RHEL:
```bash
sudo yum install epel-release
sudo yum install ffmpeg
```

### Windows:
1. Download FFmpeg from https://ffmpeg.org/download.html
2. Extract and add to PATH environment variable

### Docker Alternative:
If you prefer using Docker:
```bash
docker run -v /path/to/project:/app -p 3000:3000 node:18 sh -c "apt-get update && apt-get install -y ffmpeg && cd /app && npm start"
```

## Error Handling
- If FFmpeg is not installed, video uploads will fail with a clear error message
- Audio files continue to work without FFmpeg
- All temporary files are cleaned up regardless of success/failure

## File Processing Flow

```
Video File Upload
       ↓
   File Detection
       ↓
   Audio Extraction (FFmpeg)
       ↓
   Upload to AssemblyAI
       ↓
   Transcription Processing
       ↓
   Generate 4 Output Files:
   - Plain text (.txt)
   - Speaker-separated (_speakers.txt)
   - Timestamped (_timestamps.txt)  
   - Full JSON data (_full.json)
       ↓
   File Cleanup
```

## Testing
1. Start the server: `npm start`
2. Navigate to http://localhost:3000
3. Try uploading a video file
4. Check console for processing logs
5. Download the generated transcription files

## Troubleshooting

### "FFmpeg is not installed" Error
- Install FFmpeg using the instructions above
- Restart the server after installation
- Verify installation: `ffmpeg -version`

### Audio Extraction Fails
- Check video file isn't corrupted
- Ensure sufficient disk space in `/temp` directory
- Check FFmpeg supports your video format: `ffmpeg -formats`

### Large Video Files
- Current limit is 100MB per file
- For larger files, consider pre-processing to extract audio manually
- Or increase the limit in server.js (line 47): `fileSize: 200 * 1024 * 1024` for 200MB