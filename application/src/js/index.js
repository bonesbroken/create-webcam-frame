import { defaultWebcamFrameSettings, loadWebcamRiveFile, updateRiveProperties } from './utils.js';

let riveInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    const query = location.search.substr(1);
    const canvas = document.getElementById('canvas');
    
    if (!canvas) {
        console.error('Webcam canvas not found');
        return;
    }

    if (query && query.includes('settings=')) {
        query.split('&').forEach(part => {
            const item = part.split('=');
            if (item[0] === 'settings' && item[1]) {
                try {
                    let settings = JSON.parse(decodeURIComponent(item[1]));
                    console.log('Loaded settings from query string:', settings);
                    
                    // Load Rive file with custom settings
                    riveInstance = loadWebcamRiveFile(canvas, settings);
                } catch (err) {
                    console.error('Failed to parse settings from query string', err);
                    // Fallback to default settings
                    riveInstance = loadWebcamRiveFile(canvas, defaultWebcamFrameSettings());
                }
            }
        });
    } else {
        // Load Rive file with default settings
        riveInstance = loadWebcamRiveFile(canvas, defaultWebcamFrameSettings());
    }
});