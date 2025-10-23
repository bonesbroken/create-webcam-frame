import $ from "jquery";
import { defaultWebcamFrameSettings, loadWebcamRiveFile, updateRiveProperties } from './utils.js';
import '@shoelace-style/shoelace/dist/themes/dark.css';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/range/range.js';
import '@shoelace-style/shoelace/dist/components/color-picker/color-picker.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
setBasePath('./shoelace');

// streamlabs api variables
let streamlabs, streamlabsOBS;
let webcamSettings = defaultWebcamFrameSettings();
let canAddSource = false;
let existingSource;

// Wizard state
let currentStep = 1;
let selectedShape = null;
const totalSteps = 2;

// Make selectedShape globally accessible
window.selectedShape = null;

// Scene selection state
let availableScenes = [];
let activeSceneId = null;
let selectedSceneId = null;

let riveInstances = [];

// Helper function to safely update Rive properties
function safeUpdateRiveProperties(settings) {
    if (riveInstances.length === 0) {
        console.log('No Rive instances available for update');
        return;
    }

    const instance = riveInstances[0];
    
    // Comprehensive instance validation
    if (!instance || 
        typeof instance !== 'object' || 
        !instance.viewModelInstance || 
        typeof instance.viewModelInstance !== 'object' ||
        !instance.viewModelInstance.properties) {
        console.warn('Invalid Rive instance detected, clearing instances');
        riveInstances = [];
        return;
    }

    try {
        // Additional check for viewmodel state
        if (instance.viewModelInstance.properties.length === 0) {
            console.warn('Rive viewmodel has no properties, skipping update');
            return;
        }

        updateRiveProperties(instance, settings);
    } catch (error) {
        console.error('Error updating Rive properties:', error);
        
        // Clear all instances on any error to prevent further issues
        riveInstances.forEach(inst => {
            try {
                if (inst && typeof inst.cleanup === 'function') {
                    inst.cleanup();
                }
            } catch (cleanupError) {
                console.warn('Error during Rive cleanup:', cleanupError);
            }
        });
        riveInstances = [];
        
        // Try to recreate instance for the current visible canvas
        setTimeout(() => {
            recreateRiveInstance();
        }, 100);
    }
}

// Helper function to recreate Rive instance
function recreateRiveInstance() {
    // Find the currently visible canvas
    let targetCanvas = null;
    
    if (currentStep === 2) {
        targetCanvas = document.getElementById('webcamCanvasStep2');
        if (!targetCanvas || targetCanvas.style.display === 'none' || !targetCanvas.offsetParent) {
            targetCanvas = null;
        }
    }
    
    if (!targetCanvas && currentStep >= 2) {
        targetCanvas = document.getElementById('webcamCanvas');
        if (!targetCanvas || targetCanvas.style.display === 'none' || !targetCanvas.offsetParent) {
            targetCanvas = null;
        }
    }
    
    if (targetCanvas) {
        try {
            console.log('Recreating Rive instance for canvas:', targetCanvas.id);
            const newInstance = loadWebcamRiveFile(targetCanvas, webcamSettings);
            riveInstances = [newInstance];
        } catch (error) {
            console.error('Failed to recreate Rive instance:', error);
        }
    }
}

// Helper function to clean up all Rive instances safely
function cleanupAllRiveInstances() {
    console.log('Cleaning up all Rive instances');
    riveInstances.forEach((instance, index) => {
        try {
            if (instance && typeof instance.cleanup === 'function') {
                instance.cleanup();
            } else if (instance && typeof instance.stop === 'function') {
                instance.stop();
            }
        } catch (error) {
            console.warn(`Error cleaning up Rive instance ${index}:`, error);
        }
    });
    riveInstances = [];
}


async function loadShoelaceElements() {
    await Promise.allSettled([
        customElements.whenDefined('sl-range'),
        customElements.whenDefined('sl-icon'),
        customElements.whenDefined('sl-select'),
        customElements.whenDefined('sl-details'),
        customElements.whenDefined('sl-range')
    ]);
}

$(function() {
    loadShoelaceElements();
    updateUI(webcamSettings);
    initApp();
    initWizard();
});

async function initApp() {
    streamlabs = window.Streamlabs;
    streamlabs.init().then(async () => {
        //await loadUserSettings();

        streamlabsOBS = window.streamlabsOBS;
        streamlabsOBS.apiReady.then(() => {
            canAddSource = true;
            //console.log(streamlabsOBS);
            //console.log(streamlabs);
            
        });

        streamlabsOBS.v1.App.onNavigation(nav => {
            // Load scenes data whenever navigation happens to get current active scene
            loadScenesData().then(() => {
                // If scene modal is open, refresh the scene list
                if ($('#sceneModal').hasClass('active')) {
                    populateSceneList();
                }
            });

            if(nav.sourceId) {
                // Accesses via existing source, load source settings
                console.log('Accessed via existing source');

                streamlabsOBS.v1.Sources.getAppSourceSettings(nav.sourceId).then(loadedSettings => {
                    existingSource = nav.sourceId;

                    if(!loadedSettings) {
                        console.log('New source, no settings');
                        updateUI(webcamSettings, 'existing');
                        
                    } else {
                        console.log('Source updated from stored settings');
                        webcamSettings = JSON.parse(loadedSettings);
                        updateUI(webcamSettings, 'existing');
                        
                        // Take existing sources to step 2 for quick editing
                        selectedShape = webcamSettings['shape']; // Default shape for existing sources
                        window.selectedShape = selectedShape; // Update global reference
                        goToStep(2);
                    }
                });  
            } else {
                existingSource = null;
                // Accesses via side nav, load saved settings
                console.log('Accessed via side nav');
                updateUI(webcamSettings, 'new');
                // Start with wizard for new sources
                goToStep(1);
            }
        });
    });
}


function updateUI(settings, newSource) {
    if (!settings) return;
    $('#color').val(settings["color"] || webcamSettings["color"]);
    $('#colorInput').val(settings["color"] || webcamSettings["color"]);
    $('#strokeWidth').val(Number(settings["strokeWidth"] || webcamSettings["strokeWidth"]));

    $('#rotation').val(Number(settings["rotation"] || webcamSettings["rotation"]));
    $('#borderRadius').val(Number(settings["borderRadius"] || webcamSettings["borderRadius"]));
    $('#outerRadius').val(Number(settings["outerRadius"] || webcamSettings["outerRadius"]));
    $('#points').val(Number(settings["points"] || webcamSettings["points"]));
    $('#aspectRatio').val(settings["aspectRatio"] || webcamSettings["aspectRatio"]);

    // Hide/show settings based on shape
    if (settings.shape === 'rectangle') {
        $('#aspectRatio').closest('.setting-group').show();
        $('#rotation').closest('.setting-group').show();
        $('#borderRadius').closest('.setting-group').show();
        $('#outerRadius').closest('.setting-group').hide();
        $('#points').closest('.setting-group').hide();
    } else if (settings.shape === 'circle') {
        $('#aspectRatio').closest('.setting-group').hide();
        $('#rotation').closest('.setting-group').hide();
        $('#borderRadius').closest('.setting-group').hide();
        $('#outerRadius').closest('.setting-group').hide();
        $('#points').closest('.setting-group').hide();
    } else if (settings.shape === 'polygon') {
        $('#aspectRatio').closest('.setting-group').hide();
        $('#rotation').closest('.setting-group').show();
        $('#borderRadius').closest('.setting-group').show();
        $('#outerRadius').closest('.setting-group').hide();
        $('#points').closest('.setting-group').show();
    } else if (settings.shape === 'star') {
        $('#aspectRatio').closest('.setting-group').hide();
        $('#rotation').closest('.setting-group').show();
        $('#borderRadius').closest('.setting-group').show();
        $('#outerRadius').closest('.setting-group').show();
        $('#points').closest('.setting-group').show();
    }

    if(newSource === 'new') {
        $('#saveAppSource').hide();
    } else {
        $('#saveAppSource').show();
    }
    
    // Update step 2 instructions if currently on step 2
    if (currentStep === 2) {
        updateStep2Instructions();
    }
}

$('#color').off('sl-change');
$('#color').on('sl-change', event => {
    const val = event.target && event.target.value;
    if (val === undefined) return;
    
    const fieldId = $(event.target).attr('id');
    webcamSettings[fieldId] = val;
    $('#colorInput').val(val);
    // Update Rive viewmodel for webcam
    safeUpdateRiveProperties(webcamSettings);
});

// Color input field handler
$('#colorInput').off('sl-input');
$('#colorInput').on('sl-input', event => {
    let val = event.target && event.target.value;
    if (val === undefined) return;
    
    // Add # prefix if not present and value is not empty
    if (val !== '' && !val.startsWith('#')) {
        val = '#' + val;
    }
    
    // Validate hex color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(val) && val !== '') return;
    
    webcamSettings.color = val;
    
    // Also update the color picker to match
    $('#color').val(val);
    
    // Update Rive viewmodel for webcam
    safeUpdateRiveProperties(webcamSettings);
});

// Color input focus handler - select all text
$('#colorInput').off('sl-focus');
$('#colorInput').on('sl-focus', event => {
    // Small delay to ensure the focus is fully established
    setTimeout(() => {
        event.target.select();
    }, 10);
});

// Border radius input handler
$('#borderRadius').off('sl-input');
$('#borderRadius').on('sl-input', event => {
    const val = event.target && event.target.value;
    if (val === undefined) return;
    
    const numeric = Number(val);
    if (isNaN(numeric)) return;
    
    webcamSettings.borderRadius = numeric;
    
    // Update Rive viewmodel for webcam
    safeUpdateRiveProperties(webcamSettings);
});

$('#points').off('sl-input');
$('#points').on('sl-input', event => {
    const val = event.target && event.target.value;
    if (val === undefined) return;
    
    const numeric = Number(val);
    if (isNaN(numeric)) return;
    
    webcamSettings.points = numeric;
    
    // Update Rive viewmodel for webcam
    safeUpdateRiveProperties(webcamSettings);
});

// Outer radius input handler
$('#outerRadius').off('sl-input');
$('#outerRadius').on('sl-input', event => {
    const val = event.target && event.target.value;
    if (val === undefined) return;
    
    const numeric = Number(val);
    if (isNaN(numeric)) return;

    webcamSettings.outerRadius = numeric;

    // Update Rive viewmodel for webcam
    safeUpdateRiveProperties(webcamSettings);
});

$('#rotation').off('sl-input');
$('#rotation').on('sl-input', event => {
    const val = event.target && event.target.value;
    if (val === undefined) return;
    
    const numeric = Number(val);
    if (isNaN(numeric)) return;

    webcamSettings.rotation = numeric;

    // Update Rive viewmodel for webcam
    safeUpdateRiveProperties(webcamSettings);
});

// Stroke width input handler
$('#strokeWidth').off('sl-input');
$('#strokeWidth').on('sl-input', event => {
    const val = event.target && event.target.value;
    if (val === undefined) return;
    
    const numeric = Number(val);
    if (isNaN(numeric)) return;
    
    webcamSettings.strokeWidth = numeric;
    
    // Update Rive viewmodel for webcam
    safeUpdateRiveProperties(webcamSettings);
});


$('#aspectRatio').off('sl-change');
$('#aspectRatio').on('sl-change', event => {
    const val = event.target && event.target.value;
    if (!val) return;

    webcamSettings["aspectRatio"] = val;
    
    // Update Rive viewmodel for webcam
    safeUpdateRiveProperties(webcamSettings);
});


$('input.image-input').on('change', event => {
    let elem = $(event.target);
    let applyElem = elem.siblings('.apply-button');
    const validTypes = ['image/jpeg', 'image/png'];
    
    const selectedFile = event.target.files[0];
    if (selectedFile) {
        if (!validTypes.includes(selectedFile.type)) {
            showAlert('#generalAlert', 'Invalid file type.', 'Please select a JPG or PNG file.');
            elem[0].value = '';
            return;
        }

        console.log((selectedFile.size / (1024 * 1024)))
        if ((selectedFile.size / (1024 * 1024)) > 10) {
            showAlert('#generalAlert', 'File size too large.', 'Please upload a file less than 10 MB.');
            elem[0].value = '';
            return;
        }
        $('#spinner').show();

        streamlabs.userSettings.addAssets([ { name: `${selectedFile.name}_${String(selectedFile.lastModified)}`, file: selectedFile } ]).then(result => {
            console.log(result);
            webcamSettings.customImageUrl = result[`${selectedFile.name}_${String(selectedFile.lastModified)}`];
            
            // Update Rive viewmodel for webcam
            safeUpdateRiveProperties(webcamSettings);

            $('#spinner').hide();
        }).catch(error => {
            console.error('Error uploading asset:', error);
            $('#spinner').hide();
        });
    }
});

$(".image-upload").on('click', function(event) { 
    let elem = $(this);
    let inputElem = $('.image-input'); // Look for image input anywhere in the document
    inputElem.trigger('click');
});

$("#saveAppSource").on('click', () => { 
    if(!canAddSource) return;

    if(existingSource) {
        const sourceDisplayName = selectedShape === 'rectangle' ? 'Rectangle Frame' : 
                     selectedShape === 'circle' ? 'Circle Frame' : 
                     selectedShape === 'polygon' ? 'Polygon Frame' :
                     selectedShape === 'star' ? 'Star Frame' : 'Webcam Frame';

        streamlabsOBS.v1.Sources.updateSource({id: existingSource, name: sourceDisplayName});
        streamlabsOBS.v1.Sources.setAppSourceSettings(existingSource, JSON.stringify(webcamSettings));
        streamlabsOBS.v1.App.navigate('Editor');
        existingSource = null;
    }
});


$("#addAppSource").on('click', () => { 
    if(!canAddSource) return;
    
    // Show the scene selection modal
    openSceneSelectionModal();
});

$('#screenshot').on('click', () => {
    inspectRenderer.render(inspectScene, inspectCamera);
    const imgData = $("#inspectCanvas")[0].toDataURL("image/png");
    let link = document.createElement("a");
    link.href = imgData;
    link.download = `${$('.skin-info').attr('data-theme')}-gallery.png`;
    link.click();

    //console.log(inspectControls.getTarget(), inspectControls.getPosition());
    
});

// Download mask functionality
$("#downloadMask").on('click', () => {
    console.log('Creating mask from settings');
    
    // Create a new canvas for mask generation
    const maskCanvas = document.createElement('canvas');
    const ctx = maskCanvas.getContext('2d');
    
    // Set high resolution for better quality
    const size = 1024;
    maskCanvas.width = size;
    maskCanvas.height = size;
    
    // Get current settings
    const settings = webcamSettings;
    const shape = settings.shape || 'rectangle';
    const rotation = settings.rotation || 0;
    const borderRadius = settings.borderRadius || 10;
    const aspectRatio = settings.aspectRatio || '16:9';
    const outerRadius = settings.outerRadius || 50;
    const points = settings.points || 5;
    
    // Clear canvas with transparent background
    ctx.clearRect(0, 0, size, size);
    
    // Move to center and apply rotation
    ctx.save();
    ctx.translate(size / 2, size / 2);
    if(rotation !== 0 ) {
        ctx.rotate((rotation * Math.PI) / 180);
    }
    
    // Draw the frame shape based on shape type
    ctx.fillStyle = '#ffffff';
    
    ctx.beginPath();
    
    if (shape === 'circle') {
        // Draw circle
        const radius = size * 0.4; // 40% of canvas size
        ctx.arc(0, 0, radius, 0, 2 * Math.PI);
        
    } else if (shape === 'polygon') {
        // Draw polygon based on number of points with rounded corners
        const radius = size * 0.4;
        const angleStep = (2 * Math.PI) / points;
        const cornerRadius = Math.min(borderRadius, radius * 0.2); // Limit corner radius
        
        if (cornerRadius > 0 && points >= 3) {
            // Draw polygon with rounded corners
            const vertices = [];
            for (let i = 0; i < points; i++) {
                // Rotate by -90 degrees to put first vertex at top
                const angle = i * angleStep - Math.PI / 2;
                vertices.push({
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius
                });
            }
            
            ctx.moveTo(vertices[0].x, vertices[0].y);
            
            for (let i = 0; i < points; i++) {
                const current = vertices[i];
                const next = vertices[(i + 1) % points];
                const prev = vertices[(i - 1 + points) % points];
                
                // Calculate vectors
                const v1 = { x: current.x - prev.x, y: current.y - prev.y };
                const v2 = { x: next.x - current.x, y: next.y - current.y };
                
                // Normalize vectors
                const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
                const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
                
                if (len1 > 0) { v1.x /= len1; v1.y /= len1; }
                if (len2 > 0) { v2.x /= len2; v2.y /= len2; }
                
                // Calculate control points for rounded corner
                const offset = Math.min(cornerRadius, len1 * 0.4, len2 * 0.4);
                const cp1 = { x: current.x - v1.x * offset, y: current.y - v1.y * offset };
                const cp2 = { x: current.x + v2.x * offset, y: current.y + v2.y * offset };
                
                if (i === 0) {
                    ctx.moveTo(cp1.x, cp1.y);
                } else {
                    ctx.lineTo(cp1.x, cp1.y);
                }
                
                ctx.quadraticCurveTo(current.x, current.y, cp2.x, cp2.y);
            }
            ctx.closePath();
        } else {
            // Fallback to sharp corners
            // Rotate by -90 degrees to put first vertex at top
            const firstAngle = -Math.PI / 2;
            ctx.moveTo(Math.cos(firstAngle) * radius, Math.sin(firstAngle) * radius);
            for (let i = 1; i < points; i++) {
                const angle = i * angleStep - Math.PI / 2;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                ctx.lineTo(x, y);
            }
            ctx.closePath();
        }
        
    } else if (shape === 'star') {
        // Draw star shape with rounded corners
        const outerRadiusActual = size * 0.4;
        const innerRadiusActual = outerRadiusActual * 0.5;
        const angleStep = Math.PI / points;
        const cornerRadius = Math.min(borderRadius, innerRadiusActual * 0.3); // Limit corner radius
        
        if (cornerRadius > 0 && points >= 3) {
            // Draw star with rounded corners
            const vertices = [];
            for (let i = 0; i < points * 2; i++) {
                // Rotate by -90 degrees to put first outer point at top
                const angle = i * angleStep - Math.PI / 2;
                const radius = i % 2 === 0 ? outerRadiusActual : innerRadiusActual;
                vertices.push({
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius
                });
            }
            
            ctx.moveTo(vertices[0].x, vertices[0].y);
            
            for (let i = 0; i < vertices.length; i++) {
                const current = vertices[i];
                const next = vertices[(i + 1) % vertices.length];
                const prev = vertices[(i - 1 + vertices.length) % vertices.length];
                
                // Calculate vectors
                const v1 = { x: current.x - prev.x, y: current.y - prev.y };
                const v2 = { x: next.x - current.x, y: next.y - current.y };
                
                // Normalize vectors
                const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
                const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
                
                if (len1 > 0) { v1.x /= len1; v1.y /= len1; }
                if (len2 > 0) { v2.x /= len2; v2.y /= len2; }
                
                // Calculate control points for rounded corner
                const offset = Math.min(cornerRadius, len1 * 0.3, len2 * 0.3);
                const cp1 = { x: current.x - v1.x * offset, y: current.y - v1.y * offset };
                const cp2 = { x: current.x + v2.x * offset, y: current.y + v2.y * offset };
                
                if (i === 0) {
                    ctx.moveTo(cp1.x, cp1.y);
                } else {
                    ctx.lineTo(cp1.x, cp1.y);
                }
                
                ctx.quadraticCurveTo(current.x, current.y, cp2.x, cp2.y);
            }
            ctx.closePath();
        } else {
            // Fallback to sharp corners
            // Rotate by -90 degrees to put first outer point at top
            const firstAngle = -Math.PI / 2;
            ctx.moveTo(Math.cos(firstAngle) * outerRadiusActual, Math.sin(firstAngle) * outerRadiusActual);
            for (let i = 1; i < points * 2; i++) {
                const angle = i * angleStep - Math.PI / 2;
                const radius = i % 2 === 0 ? outerRadiusActual : innerRadiusActual;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                ctx.lineTo(x, y);
            }
            ctx.closePath();
        }
        
    } else {
        // Default to rectangle with aspect ratio
        let frameWidth, frameHeight;
        switch(aspectRatio) {
            case '16:9':
                frameWidth = size * 0.95;
                frameHeight = frameWidth * (9/16);
                break;
            case '4:3':
                frameWidth = size * 0.95;
                frameHeight = frameWidth * (3/4);
                break;
            case '1:1':
                frameWidth = size * 0.95;
                frameHeight = frameWidth;
                break;
            default:
                frameWidth = size * 0.95;
                frameHeight = frameWidth * (9/16);
        }
        
        const x = -frameWidth / 2;
        const y = -frameHeight / 2;
        ctx.roundRect(x, y, frameWidth, frameHeight, borderRadius * 0.5);
    }
    
    ctx.fill();
    
    ctx.restore();
    
    // Download the mask
    maskCanvas.toBlob(function(blob) {
        if (!blob) {
            console.error('Failed to create mask blob');
            showAlert('#generalAlert', 'Export Error', 'Failed to create mask image.');
            return;
        }
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Create descriptive filename based on shape
        let filename = 'webcam-frame-mask';
        if (shape === 'circle') {
            filename = 'webcam-circle-mask';
        } else if (shape === 'polygon') {
            filename = `webcam-${points}gon-mask`;
        } else if (shape === 'star') {
            filename = `webcam-${points}star-mask`;
        } else {
            filename = `webcam-rectangle-${aspectRatio.replace(':', 'x')}-mask`;
        }
        
        link.download = filename + '.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.log('Mask download completed');
    }, 'image/png');
});

function showAlert(element, title, content) {
    $(element)[0].show();
    $(element).find('.alert-title').text(title);
    $(element).find('.alert-content').text(content);
}

function updateStep2Instructions() {
    const saveButtonVisible = $('#saveAppSource').is(':visible');
    const createButtonVisible = $('#addAppSource').is(':visible');
    
    let instructionText = '';
    
    if (saveButtonVisible && createButtonVisible) {
        instructionText = 'Use the buttons below to save existing or add new source.';
    } else if (saveButtonVisible) {
        instructionText = 'Use the "Save Existing" button below to update your source.';
    } else if (createButtonVisible) {
        instructionText = 'Use the "Add New" button below to create your source.';
    } else {
        instructionText = 'Your source configuration is ready.';
    }
    
    $('#actionInstructions').text(instructionText);
}

function switchCanvas() {
    // Canvas switching is no longer needed since we only have webcam frames
    // Keep this function for potential future use with different shapes
    const webcamCanvas = document.getElementById('webcamCanvas');
    const webcamCanvasStep2 = document.getElementById('webcamCanvasStep2');
    
    if (webcamCanvas) {
        webcamCanvas.style.display = 'block';
    }
    if (webcamCanvasStep2) {
        webcamCanvasStep2.style.display = 'block';
    }
}

function forceCanvasRender() {
    // Render on webcam canvases
    const canvas2 = document.getElementById('webcamCanvas');
    const canvas3 = document.getElementById('webcamCanvasStep2');
    
    // Show spinners before creating instances
    if (canvas2) {
        const spinner2 = canvas2.parentElement.querySelector('sl-spinner');
        if (spinner2) spinner2.style.display = 'block';
    }
    if (canvas3) {
        const spinner3 = canvas3.parentElement.querySelector('sl-spinner');
        if (spinner3) spinner3.style.display = 'block';
    }
    
    // Clean up existing instances more safely
    if (riveInstances.length > 0) {
        console.log('Cleaning up existing Rive instances');
        riveInstances.forEach((instance, index) => {
            try {
                if (instance && typeof instance.cleanup === 'function') {
                    instance.cleanup();
                } else if (instance && typeof instance.stop === 'function') {
                    instance.stop();
                }
            } catch (cleanupError) {
                console.warn(`Error cleaning up Rive instance ${index}:`, cleanupError);
            }
        });
        riveInstances = [];
        
        // Wait a bit for cleanup to complete
        setTimeout(() => {
            createNewRiveInstances(canvas2, canvas3);
        }, 200);
    } else {
        createNewRiveInstances(canvas2, canvas3);
    }
}

// Helper function to create new Rive instances
function createNewRiveInstances(canvas2, canvas3) {
    const visibleCanvases = [];
    
    if (canvas2 && canvas2.offsetParent && canvas2.style.display !== 'none') {
        visibleCanvases.push({ canvas: canvas2, step: 2 });
    }
    
    if (canvas3 && canvas3.offsetParent && canvas3.style.display !== 'none') {
        visibleCanvases.push({ canvas: canvas3, step: 2 });
    }
    
    // Only create instances for visible canvases
    visibleCanvases.forEach(({ canvas, step }) => {
        try {
            console.log(`Creating Rive instance for ${webcamSettings['shape']} frame step ${step}`);
            const instance = loadWebcamRiveFile(canvas, webcamSettings);
            riveInstances.push(instance);
            
            // Hide spinner after instance is created
            const spinner = canvas.parentElement.querySelector('sl-spinner');
            if (spinner) spinner.style.display = 'none';
        } catch (error) {
            console.error(`Error creating Rive instance for ${webcamSettings['shape']} framestep ${step}:`, error);
            
            // Hide spinner even on error
            const spinner = canvas.parentElement.querySelector('sl-spinner');
            if (spinner) spinner.style.display = 'none';
        }
    });
}

// Wizard Functions
function initWizard() {
    // Shape selection via icon buttons
    $('sl-icon-button[data-shape]').on('click', function() {
        const shape = $(this).data('shape');
        
        // Remove 'selected' state from all shape buttons
        $('sl-icon-button[data-shape]').each(function() {
            const iconName = $(this).attr('name');
            const baseIconName = iconName.replace('-half', '');
            $(this).attr('name', baseIconName);
        });
        
        // Add 'selected' state to clicked button
        const currentIconName = $(this).attr('name');
        $(this).attr('name', currentIconName + '-half');
        
        // Update shape selection
        selectedShape = shape;
        window.selectedShape = selectedShape;
        webcamSettings.shape = selectedShape;
        
        // Update UI and recreate Rive instances
        updateUI(webcamSettings, existingSource ? 'existing' : 'new');
        setTimeout(() => {
            forceCanvasRender();
        }, 150);
    });
    
    // Navigation handlers
    $('#step1Next').on('click', () => goToStep(2));
    $('#step2Back').on('click', () => goToStep(1));
}

function goToStep(step) {
    // Hide current step
    $(`.wizard-step`).removeClass('active');
    
    // Show target step
    $(`#step${step}`).addClass('active');
    
    // Update step indicators
    $('.step-number').removeClass('active');
    $('.step-number').removeClass('completed');
    $('.step-number').removeClass('previous');
    for (let i = 1; i < step; i++) {
        $(`.step-number:nth-child(${i})`).addClass('previous');
    }
    $(`.step-number:nth-child(${step})`).addClass('active');
    
    currentStep = step;
    
    // Update UI with current settings when moving between steps
    updateUI(webcamSettings, existingSource ? 'existing' : 'new');
    
    // Update step 2 instructions based on available actions
    if (step >= 2) {
        updateStep2Instructions();
        switchCanvas();
        
    }
    setTimeout(() => {
        forceCanvasRender();
    }, 150);
}

// Scene Selection Modal Functions
function openSceneSelectionModal() {
    // Show modal first
    $('#sceneModal').addClass('active');
    selectedSceneId = null;
    $('#sceneModalConfirm').removeClass('visible');
    
    // Load scenes and populate modal
    loadScenesData().then(() => {
        // Ensure scene list is populated
        populateSceneList();
        // Set the active scene as initially selected and update button text
        if (activeSceneId) {
            const activeScene = availableScenes.find(scene => scene.id === activeSceneId);
            if (activeScene) {
                selectedSceneId = activeSceneId;
                $('#sceneModalConfirm').addClass('visible');
                $(`.scene-item[data-scene-id="${activeSceneId}"]`).addClass('selected');
            }
        }
    });
}

function closeSceneSelectionModal() {
    $('#sceneModal').removeClass('active');
    selectedSceneId = null;
}

async function loadScenesData() {
    try {
        // Get all scenes and active scene
        const [scenes, activeScene] = await Promise.all([
            streamlabsOBS.v1.Scenes.getScenes(),
            streamlabsOBS.v1.Scenes.getActiveScene()
        ]);
        
        availableScenes = scenes;
        activeSceneId = activeScene.id;
        
    } catch (error) {
        console.error('Error loading scenes data:', error);
        if ($('#sceneModal').hasClass('active')) {
            showAlert('#generalAlert', 'Error', 'Failed to load scenes data.');
        }
    }
}

function populateSceneList() {
    const sceneListContainer = $('#sceneList');
    sceneListContainer.empty();
    
    availableScenes.forEach(scene => {
        const isActive = scene.id === activeSceneId;
        const badgeHtml = isActive ? ' <sl-badge variant="primary">Current</sl-badge>' : '';
        const sceneItem = $(`
            <div class="scene-item ${isActive ? 'selected' : ''}" data-scene-id="${scene.id}">
                ${scene.name}${badgeHtml}
            </div>
        `);
        
        sceneItem.on('click', () => selectScene(scene));
        sceneListContainer.append(sceneItem);
    });
}

function selectScene(scene) {
    // Update UI
    $('.scene-item').removeClass('selected');
    $(`.scene-item[data-scene-id="${scene.id}"]`).addClass('selected');
    
    selectedSceneId = scene.id;
    $('#sceneModalConfirm').addClass('visible');
}

async function confirmAddToScene() {
    if (!selectedSceneId) return;
    
    try {
        const sourceDisplayName = selectedShape === 'rectangle' ? 'Rectangle Frame' : 
                     selectedShape === 'circle' ? 'Circle Frame' : 
                     selectedShape === 'polygon' ? 'Polygon Frame' :
                     selectedShape === 'star' ? 'Star Frame' : 'Webcam Frame';

        const sourceIDName = 'bb-webcam-frame'; // Keep the same source ID for consistency
        const source = await streamlabsOBS.v1.Sources.createAppSource(sourceDisplayName, sourceIDName);
        await streamlabsOBS.v1.Sources.setAppSourceSettings(source.id, JSON.stringify(webcamSettings));
        await streamlabsOBS.v1.Scenes.createSceneItem(selectedSceneId, source.id);
        
        closeSceneSelectionModal();
        streamlabsOBS.v1.App.navigate('Editor');
        
    } catch (error) {
        console.error('Error adding source to scene:', error);
        showAlert('#generalAlert', 'Error', 'Failed to add source to scene.');
    }
}

// Modal event handlers
$(document).ready(() => {
    $('#cancelSceneModal').on('click', closeSceneSelectionModal);
    $('#confirmAddSource').on('click', confirmAddToScene);
    
    // Close app button handler
    $('#closeApp').on('click', () => {
        cleanupAllRiveInstances();
        streamlabsOBS.v1.App.navigate('Editor');
    });
    
    // Close modal when clicking outside
    $('#sceneModal').on('click', (e) => {
        if (e.target.id === 'sceneModal') {
            closeSceneSelectionModal();
        }
    });
});