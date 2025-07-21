class TranscriptionApp {
    constructor() {
        this.selectedFiles = [];
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.progressSection = document.getElementById('progressSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.fileProgress = document.getElementById('fileProgress');
        this.resultsSection = document.getElementById('resultsSection');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.errorSection = document.getElementById('errorSection');
        this.errorContainer = document.getElementById('errorContainer');
    }

    bindEvents() {
        // File input change
        this.fileInput.addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files);
        });

        // Upload area click
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });

        // Drag and drop events
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            this.handleFileSelection(e.dataTransfer.files);
        });

        // Button events
        this.uploadBtn.addEventListener('click', () => {
            this.uploadFiles();
        });

        this.clearBtn.addEventListener('click', () => {
            this.clearFiles();
        });
    }

    handleFileSelection(files) {
        const validFiles = Array.from(files).filter(file => {
            const validTypes = [
                'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac',
                'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv',
                'audio/ogg', 'video/webm'
            ];
            
            if (!validTypes.includes(file.type)) {
                this.showError(`Unsupported file type: ${file.name}`);
                return false;
            }

            if (file.size > 100 * 1024 * 1024) { // 100MB
                this.showError(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
                return false;
            }

            return true;
        });

        this.selectedFiles = [...this.selectedFiles, ...validFiles];
        this.updateUI();
    }

    updateUI() {
        if (this.selectedFiles.length > 0) {
            this.uploadBtn.disabled = false;
            this.clearBtn.disabled = false;
            
            // Update upload area text
            const uploadContent = this.uploadArea.querySelector('.upload-content');
            uploadContent.innerHTML = `
                <i class="fas fa-file-audio"></i>
                <h3>${this.selectedFiles.length} File(s) Selected</h3>
                <p>Ready to transcribe</p>
                <div class="file-list">
                    ${this.selectedFiles.map(file => `
                        <div class="file-item">
                            <i class="fas fa-file"></i>
                            <span>${file.name}</span>
                            <span class="file-size">(${(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            this.uploadBtn.disabled = true;
            this.clearBtn.disabled = true;
            
            // Reset upload area
            const uploadContent = this.uploadArea.querySelector('.upload-content');
            uploadContent.innerHTML = `
                <i class="fas fa-cloud-upload-alt"></i>
                <h3>Drag & Drop Files Here</h3>
                <p>or click to browse</p>
                <p class="file-types">Supported: MP3, MP4, WAV, M4A, AAC, AVI, MOV, WMV, FLV, OGG, WEBM</p>
                <p class="file-limit">Max file size: 100MB</p>
            `;
        }
    }

    async uploadFiles() {
        if (this.selectedFiles.length === 0) return;

        this.showProgress();
        this.hideResults();
        this.hideErrors();

        const formData = new FormData();
        
        if (this.selectedFiles.length === 1) {
            formData.append('file', this.selectedFiles[0]);
            await this.uploadSingleFile(formData);
        } else {
            this.selectedFiles.forEach(file => {
                formData.append('files', file);
            });
            await this.uploadBatchFiles(formData);
        }
    }

    async uploadSingleFile(formData) {
        try {
            console.log('Starting single file upload workflow');
            this.updateProgress(10, 'Uploading file...');
            
            console.log('Sending POST request to /upload');
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            console.log('Response received:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok
            });

            if (!response.ok) {
                let errorDetails = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    console.log('Server error response:', errorData);
                    errorDetails += ` - ${errorData.error || 'Unknown error'}`;
                    if (errorData.details) {
                        errorDetails += ` (${errorData.details})`;
                    }
                } catch (parseError) {
                    console.log('Failed to parse error response as JSON:', parseError);
                    const errorText = await response.text();
                    console.log('Raw error response:', errorText);
                    errorDetails += ` - ${errorText}`;
                }
                throw new Error(errorDetails);
            }

            this.updateProgress(50, 'Transcribing...');
            
            console.log('Parsing successful response');
            const result = await response.json();
            console.log('Parsed result:', result);
            
            if (result.success) {
                console.log('Transcription successful, showing results');
                this.updateProgress(100, 'Complete!');
                setTimeout(() => {
                    this.showResults([result]);
                    this.hideProgress();
                }, 1000);
            } else {
                const errorMsg = result.error || 'Transcription failed';
                console.log('Transcription failed:', errorMsg);
                throw new Error(errorMsg);
            }

        } catch (error) {
            console.error('Upload workflow error:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            this.showError(`Upload failed: ${error.message}`);
            this.hideProgress();
        }
    }

    async uploadBatchFiles(formData) {
        try {
            console.log('Starting batch file upload workflow');
            this.updateProgress(10, 'Uploading files...');
            
            console.log('Sending POST request to /upload/batch');
            const response = await fetch('/upload/batch', {
                method: 'POST',
                body: formData
            });

            console.log('Batch response received:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok
            });

            if (!response.ok) {
                let errorDetails = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    console.log('Server error response:', errorData);
                    errorDetails += ` - ${errorData.error || 'Unknown error'}`;
                    if (errorData.details) {
                        errorDetails += ` (${errorData.details})`;
                    }
                } catch (parseError) {
                    console.log('Failed to parse error response as JSON:', parseError);
                    const errorText = await response.text();
                    console.log('Raw error response:', errorText);
                    errorDetails += ` - ${errorText}`;
                }
                throw new Error(errorDetails);
            }

            this.updateProgress(50, 'Transcribing files...');
            
            console.log('Parsing successful batch response');
            const result = await response.json();
            console.log('Parsed batch result:', result);
            
            if (result.success) {
                console.log('Batch transcription completed:', {
                    totalProcessed: result.totalProcessed,
                    totalErrors: result.totalErrors,
                    resultsCount: result.results?.length || 0,
                    errorsCount: result.errors?.length || 0
                });
                this.updateProgress(100, 'Complete!');
                setTimeout(() => {
                    this.showResults(result.results);
                    if (result.errors && result.errors.length > 0) {
                        console.log('Some files had errors:', result.errors);
                        this.showErrors(result.errors);
                    }
                    this.hideProgress();
                }, 1000);
            } else {
                const errorMsg = result.error || 'Batch transcription failed';
                console.log('Batch transcription failed:', errorMsg);
                throw new Error(errorMsg);
            }

        } catch (error) {
            console.error('Batch upload workflow error:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            this.showError(`Batch upload failed: ${error.message}`);
            this.hideProgress();
        }
    }

    updateProgress(percentage, message) {
        this.progressFill.style.width = `${percentage}%`;
        this.progressText.textContent = `${percentage}%`;
        this.fileProgress.textContent = message;
    }

    showProgress() {
        this.progressSection.style.display = 'block';
        this.progressSection.scrollIntoView({ behavior: 'smooth' });
    }

    hideProgress() {
        this.progressSection.style.display = 'none';
    }

    showResults(results) {
        this.resultsContainer.innerHTML = results.map(result => `
            <div class="result-item">
                <div class="result-header">
                    <div class="result-filename">${result.originalName || result.filename}</div>
                    <div class="result-actions">
                        <button class="btn btn-small btn-success" onclick="window.open('${result.downloadUrl}', '_blank')">
                            <i class="fas fa-download"></i> Download
                        </button>
                    </div>
                </div>
                <div class="result-text">${this.escapeHtml(result.transcription)}</div>
            </div>
        `).join('');
        
        this.resultsSection.style.display = 'block';
        this.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    hideResults() {
        this.resultsSection.style.display = 'none';
    }

    showErrors(errors) {
        this.errorContainer.innerHTML = errors.map(error => `
            <div class="error-item">
                <div class="error-filename">${error.filename}</div>
                <div class="error-message">${this.escapeHtml(error.error)}</div>
            </div>
        `).join('');
        
        this.errorSection.style.display = 'block';
        this.errorSection.scrollIntoView({ behavior: 'smooth' });
    }

    showError(message) {
        this.errorContainer.innerHTML = `
            <div class="error-item">
                <div class="error-message">${this.escapeHtml(message)}</div>
            </div>
        `;
        
        this.errorSection.style.display = 'block';
        this.errorSection.scrollIntoView({ behavior: 'smooth' });
    }

    hideErrors() {
        this.errorSection.style.display = 'none';
    }

    clearFiles() {
        this.selectedFiles = [];
        this.fileInput.value = '';
        this.updateUI();
        this.hideProgress();
        this.hideResults();
        this.hideErrors();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TranscriptionApp();
}); 