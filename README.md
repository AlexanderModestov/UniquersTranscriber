# Uniquers Transcription

A modern web application for audio and video transcription using AssemblyAI's powerful speech recognition API.

## Features

- 🎵 **Multi-format Support**: MP3, MP4, WAV, M4A, AAC, AVI, MOV, WMV, FLV, OGG, WEBM
- 📁 **Drag & Drop Interface**: Intuitive file upload with visual feedback
- 🔄 **Batch Processing**: Upload and transcribe multiple files simultaneously
- 📊 **Real-time Progress**: Track upload and transcription progress
- 💾 **File Management**: Automatic file cleanup and organized storage
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🔒 **Secure**: API key stored in environment variables

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- AssemblyAI API key

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd UniquersTranscribation
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
   PORT=3000
   MAX_FILE_SIZE=100MB
   ```

   **Get your AssemblyAI API key:**
   - Sign up at [AssemblyAI](https://www.assemblyai.com/)
   - Go to your account dashboard
   - Copy your API key
   - Replace `your_assemblyai_api_key_here` with your actual key

4. **Start the application**
   ```bash
   # Development mode (with auto-restart)
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## Usage

### Single File Transcription
1. Drag and drop an audio/video file onto the upload area
2. Click "Upload & Transcribe"
3. Wait for the transcription to complete
4. View the results and download the text file

### Batch Transcription
1. Select multiple files (up to 10)
2. Click "Upload & Transcribe"
3. Monitor progress for all files
4. Download individual transcription files

### Supported File Formats
- **Audio**: MP3, WAV, M4A, AAC, OGG
- **Video**: MP4, AVI, MOV, WMV, FLV, WEBM
- **Max File Size**: 100MB per file

## Project Structure

```
UniquersTranscribation/
├── server.js              # Express server with API endpoints
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (create this)
├── public/                # Frontend files
│   ├── index.html         # Main HTML page
│   ├── styles.css         # CSS styles
│   └── script.js          # Frontend JavaScript
├── uploads/               # Temporary upload storage
├── transcriptions/        # Generated transcription files
└── temp/                  # Temporary processing files
```

## API Endpoints

- `GET /` - Serve the main application
- `POST /upload` - Upload and transcribe a single file
- `POST /upload/batch` - Upload and transcribe multiple files
- `GET /download/:filename` - Download a transcription file
- `GET /status/:transcriptId` - Get transcription status

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ASSEMBLYAI_API_KEY` | Your AssemblyAI API key | Required |
| `PORT` | Server port | 3000 |
| `MAX_FILE_SIZE` | Maximum file size limit | 100MB |

### File Size Limits

The application enforces a 100MB file size limit per file. This can be adjusted in the `.env` file and server configuration.

## Error Handling

The application includes comprehensive error handling for:
- Unsupported file types
- File size limits
- API failures
- Network issues
- Invalid API keys

## Security Considerations

- API keys are stored in environment variables
- Temporary files are automatically cleaned up
- File type validation prevents malicious uploads
- CORS is configured for security

## Development

### Running in Development Mode
```bash
npm run dev
```

This uses nodemon to automatically restart the server when files change.

### Adding New Features
1. The frontend is built with vanilla JavaScript for simplicity
2. The backend uses Express.js with multer for file handling
3. AssemblyAI SDK handles all transcription operations

## Troubleshooting

### Common Issues

1. **"API key not found" error**
   - Ensure your `.env` file exists and contains the correct API key
   - Restart the server after adding the `.env` file

2. **File upload fails**
   - Check file size (max 100MB)
   - Verify file format is supported
   - Ensure stable internet connection

3. **Transcription fails**
   - Verify your AssemblyAI API key is valid
   - Check your AssemblyAI account balance
   - Ensure the audio/video file is not corrupted

4. **Server won't start**
   - Check if port 3000 is already in use
   - Verify all dependencies are installed
   - Check for syntax errors in server.js

### Logs

Check the console output for detailed error messages and debugging information.

## License

MIT License - see LICENSE file for details.

## Support

For issues related to:
- **AssemblyAI API**: Contact AssemblyAI support
- **Application bugs**: Open an issue in the repository
- **Setup problems**: Check the troubleshooting section above

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Note**: This application requires an active AssemblyAI account and API key to function. AssemblyAI offers free credits for new users. 