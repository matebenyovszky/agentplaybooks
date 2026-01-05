/**
 * Secure file attachment validator
 * 
 * Security features:
 * - Whitelist file types only
 * - Size limits enforced
 * - Filename sanitization
 * - Path traversal prevention
 * - Content validation
 */

import { 
  ALLOWED_FILE_TYPES, 
  FILE_EXTENSION_MAP, 
  ATTACHMENT_LIMITS,
  type AttachmentFileType 
} from './supabase/types';

export interface AttachmentValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedFilename?: string;
  detectedType?: AttachmentFileType;
}

/**
 * Validates and sanitizes a filename
 * - Removes path components
 * - Validates characters
 * - Checks length
 * - Detects file type
 */
export function validateFilename(filename: string): AttachmentValidationResult {
  const errors: string[] = [];
  
  // Remove any path components (security: path traversal)
  let sanitized = filename.replace(/^.*[\\\/]/, '');
  
  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    errors.push('Path traversal detected in filename');
  }
  
  // Check length
  if (sanitized.length === 0) {
    errors.push('Filename is empty');
    return { valid: false, errors };
  }
  
  if (sanitized.length > ATTACHMENT_LIMITS.MAX_FILENAME_LENGTH) {
    errors.push(`Filename too long (max ${ATTACHMENT_LIMITS.MAX_FILENAME_LENGTH} characters)`);
  }
  
  // Validate characters: only a-zA-Z0-9_.-
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
  if (!validPattern.test(sanitized)) {
    // Try to sanitize
    sanitized = sanitized
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/^[^a-zA-Z0-9]/, 'f');
    
    if (!validPattern.test(sanitized)) {
      errors.push('Filename contains invalid characters');
    }
  }
  
  // Detect file type from extension
  const ext = sanitized.includes('.') 
    ? '.' + sanitized.split('.').pop()?.toLowerCase() 
    : null;
  
  const detectedType = ext ? FILE_EXTENSION_MAP[ext] : undefined;
  
  if (ext && !detectedType) {
    errors.push(`Unsupported file extension: ${ext}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitizedFilename: sanitized,
    detectedType,
  };
}

/**
 * Validates file content
 * - Checks size limits
 * - Validates content is valid UTF-8 text
 * - No null bytes or control characters
 */
export function validateContent(content: string): AttachmentValidationResult {
  const errors: string[] = [];
  
  // Check size (in bytes, not characters)
  const sizeBytes = new TextEncoder().encode(content).length;
  
  if (sizeBytes > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
    errors.push(`File too large (${sizeBytes} bytes, max ${ATTACHMENT_LIMITS.MAX_FILE_SIZE} bytes)`);
  }
  
  if (sizeBytes === 0) {
    errors.push('File is empty');
  }
  
  // Check for null bytes (binary content)
  if (content.includes('\0')) {
    errors.push('Binary content detected (null bytes)');
  }
  
  // Check for suspicious control characters (except common ones like \n, \r, \t)
  const suspiciousChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
  if (suspiciousChars.test(content)) {
    errors.push('Suspicious control characters detected');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates file type
 */
export function validateFileType(fileType: string): AttachmentValidationResult {
  const errors: string[] = [];
  
  if (!ALLOWED_FILE_TYPES.includes(fileType as AttachmentFileType)) {
    errors.push(`Invalid file type: ${fileType}. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    detectedType: fileType as AttachmentFileType,
  };
}

/**
 * Full validation of an attachment
 */
export function validateAttachment(
  filename: string,
  content: string,
  fileType?: string
): AttachmentValidationResult {
  const allErrors: string[] = [];
  
  // Validate filename
  const filenameResult = validateFilename(filename);
  allErrors.push(...filenameResult.errors);
  
  // Validate content
  const contentResult = validateContent(content);
  allErrors.push(...contentResult.errors);
  
  // Validate or detect file type
  const type = fileType || filenameResult.detectedType;
  if (type) {
    const typeResult = validateFileType(type);
    allErrors.push(...typeResult.errors);
  } else {
    allErrors.push('Could not determine file type');
  }
  
  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    sanitizedFilename: filenameResult.sanitizedFilename,
    detectedType: (fileType as AttachmentFileType) || filenameResult.detectedType,
  };
}

/**
 * Sanitize content for safe display
 * - Escapes HTML entities
 * - Preserves whitespace for code display
 */
export function sanitizeForDisplay(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Get syntax highlighting language from file type
 */
export function getHighlightLanguage(fileType: AttachmentFileType): string {
  const languageMap: Record<AttachmentFileType, string> = {
    typescript: 'typescript',
    javascript: 'javascript',
    python: 'python',
    go: 'go',
    rust: 'rust',
    sql: 'sql',
    markdown: 'markdown',
    json: 'json',
    yaml: 'yaml',
    text: 'plaintext',
    cursorrules: 'yaml', // cursorrules are YAML-like
    shell: 'bash',
  };
  
  return languageMap[fileType] || 'plaintext';
}


