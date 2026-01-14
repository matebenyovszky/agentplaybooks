#!/usr/bin/env node

/**
 * Copy blog and docs markdown files to OpenNext assets directory.
 * This ensures they're available in the Cloudflare Workers deployment.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const assetsDir = path.join(projectRoot, '.open-next', 'assets');

function copyDirectory(src: string, dest: string) {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    // Read source directory
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            // Recursively copy subdirectories
            copyDirectory(srcPath, destPath);
        } else {
            // Copy file
            fs.copyFileSync(srcPath, destPath);
            console.log(`  ✓ ${path.relative(publicDir, srcPath)}`);
        }
    }
}

try {
    console.log('📋 Copying markdown files to OpenNext assets...');

    if (!fs.existsSync(assetsDir)) {
        console.error('❌ OpenNext assets directory not found. Run build:worker first.');
        process.exit(1);
    }

    // Copy blog markdown files
    const blogSrc = path.join(publicDir, 'blog');
    const blogDest = path.join(assetsDir, 'blog');

    if (fs.existsSync(blogSrc)) {
        console.log('📝 Copying blog files...');
        copyDirectory(blogSrc, blogDest);
    }

    // Copy docs markdown files
    const docsSrc = path.join(publicDir, 'docs');
    const docsDest = path.join(assetsDir, 'docs');

    if (fs.existsSync(docsSrc)) {
        console.log('📚 Copying docs files...');
        copyDirectory(docsSrc, docsDest);
    }

    console.log('✅ Markdown files copied successfully!');
} catch (error) {
    console.error('❌ Error copying markdown files:', error);
    process.exit(1);
}
