import $ from "jquery";
import { defaultWebcamFrameSettings, loadWebcamRiveFile, updateRiveProperties, hexToArgbInt } from './utils.js';
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
    console.log('Updating UI with settings:', settings, 'New source:', newSource);
    if (!settings) return;
    $('#color').val(settings["color"] || webcamSettings["color"]);
    $('#colorInput').val(settings["color"] || webcamSettings["color"]);
    $('#strokeWidth').val(Number(settings["strokeWidth"] || webcamSettings["strokeWidth"]));

    $('#rotation').val(Number(settings["rotation"] || webcamSettings["rotation"]));
    $('#borderRadius').val(Number(settings["borderRadius"] || webcamSettings["borderRadius"]));
    $('#outerRadius').val(Number(settings["outerRadius"] || webcamSettings["outerRadius"]));
    $('#points').val(Number(settings["points"] || webcamSettings["points"]));
    $('#aspectRatio').val(settings["aspectRatio"] || webcamSettings["aspectRatio"]);

    // Update shape button selection states
    $('sl-icon-button[data-shape]').each(function() {
        const buttonShape = $(this).data('shape');
        const iconName = $(this).attr('name');
        const baseIconName = iconName.replace('-half', '');
        
        if (buttonShape === settings.shape) {
            // Add 'selected' state to current shape button
            $(this).attr('name', baseIconName + '-half');
        } else {
            // Remove 'selected' state from other buttons
            $(this).attr('name', baseIconName);
        }
    });

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
$("#downloadMask").on('click', async () => {
    console.log('Creating mask from canvas using createImageBitmap');
    
    try {
        const canvas = document.getElementById('webcamCanvasStep2') || document.getElementById('webcamCanvas');

        if (!canvas) {
            console.error('No canvas found');
            showAlert('#generalAlert', 'Export Error', 'No canvas available for export.');
            return;
        }

        // Set canvas dimensions for export
        const exportCanvas = document.createElement('canvas');
        const exportCtx = exportCanvas.getContext('2d');
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        
        // Read pixels from WebGL canvas
        const gl = canvas.getContext('webgl2', {preserveDrawingBuffer: true});
        
        if (!gl) {
            console.error('Failed to get WebGL2 context');
            showAlert('#generalAlert', 'Export Error', 'WebGL2 context not available.');
            return;
        }
        
        // Check if context is lost
        if (gl.isContextLost()) {
            console.error('WebGL2 context is lost');
            showAlert('#generalAlert', 'Export Error', 'WebGL2 context is lost.');
            return;
        }
        
        // Force a render if needed - check if Rive instance is available
        if (riveInstances.length > 0 && riveInstances[0]) {
            console.log('Forcing Rive render before export');
            try {
                const vmi = riveInstances[0].viewModelInstance;
                vmi.color('fillColor').value = hexToArgbInt(`#FFFFFF`);
                vmi.color('color').value = hexToArgbInt(webcamSettings['color'], 0x00);
                // Force Rive to render one more frame
                if (typeof riveInstances[0].advance === 'function') {
                    riveInstances[0].advance(0);
                }
                if (typeof riveInstances[0].draw === 'function') {
                    riveInstances[0].draw();
                }
            } catch (renderError) {
                console.warn('Error forcing Rive render:', renderError);
            }
        }
        
        // Ensure we're reading from the correct framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        
        // Check if we got any non-transparent pixels
        let hasContent = false;
        for (let i = 3; i < pixels.length; i += 4) { // Check alpha channel
            if (pixels[i] > 0) {
                hasContent = true;
                break;
            }
        }
        
        if (!hasContent) {
            console.warn('Canvas appears to be empty or fully transparent');
            showAlert('#generalAlert', 'Export Warning', 'Canvas appears to be empty. Make sure the frame is rendered.');
            // Continue anyway in case there's content we can't detect
        }
        
        // Create ImageData and flip Y coordinate manually (WebGL has flipped Y)
        const flippedPixels = new Uint8ClampedArray(pixels.length);
        const width = canvas.width;
        const height = canvas.height;
        
        // Flip the image data vertically
        for (let y = 0; y < height; y++) {
            const srcRowStart = y * width * 4;
            const destRowStart = (height - 1 - y) * width * 4;
            for (let x = 0; x < width * 4; x++) {
                flippedPixels[destRowStart + x] = pixels[srcRowStart + x];
            }
        }
        
        const imageData = new ImageData(flippedPixels, canvas.width, canvas.height);
        
        // Put the correctly oriented image data on the 2D canvas
        exportCtx.putImageData(imageData, 0, 0);
        
        // Alternative: Try direct canvas.toDataURL() as fallback
        let capturedImage;
        try {
            capturedImage = exportCanvas.toDataURL('image/png');
            console.log('Export canvas toDataURL successful');
            
            // Check if the data URL has actual content (not just a blank image)
            if (capturedImage.length < 1000) { // Very small data URLs are usually blank
                console.warn('Export canvas data URL is suspiciously small, trying direct canvas export');
                capturedImage = canvas.toDataURL('image/png');
            }
        } catch (exportError) {
            console.error('Error converting export canvas to data URL:', exportError);
            // Fallback to direct canvas export
            capturedImage = canvas.toDataURL('image/png');
        }
        
        console.log('Final image data URL length:', capturedImage.length);
        
        
        const link = document.createElement('a');
        link.href = capturedImage;
        
        // Generate filename based on current settings
        const settings = webcamSettings;
        const shape = settings.shape || 'rectangle';
        const points = settings.points || 5;
        const aspectRatio = settings.aspectRatio || '16:9';
        
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
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('Canvas mask download completed:', filename + '.png');
        const vmi = riveInstances[0].viewModelInstance;
        vmi.color('color').value = hexToArgbInt(webcamSettings['color']);
        vmi.color('fillColor').value = hexToArgbInt(webcamSettings['fillColor']);
        
    } catch (error) {
        console.error('Error creating mask from canvas:', error);
        showAlert('#generalAlert', 'Export Error', 'Failed to create mask from canvas.');
    }
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
    const canvas = document.getElementById('webcamCanvas');
    const canvas2 = document.getElementById('webcamCanvasStep2');
    
    // Show spinners before creating instances
    if (canvas) {
        const spinner2 = canvas.parentElement.querySelector('sl-spinner');
        if (spinner2) spinner2.style.display = 'block';
    }
    if (canvas2) {
        const spinner3 = canvas2.parentElement.querySelector('sl-spinner');
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
            createNewRiveInstances(canvas, canvas2);
        }, 200);
    } else {
        createNewRiveInstances(canvas, canvas2);
    }
}

// Helper function to create new Rive instances
function createNewRiveInstances(canvas, canvas2) {
    const visibleCanvases = [];
    
    if (canvas && canvas.offsetParent && canvas.style.display !== 'none') {
        visibleCanvases.push({ canvas: canvas, step: 2 });
    }
    
    if (canvas2 && canvas2.offsetParent && canvas2.style.display !== 'none') {
        visibleCanvases.push({ canvas: canvas2, step: 2 });
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
    setTimeout(() => {
        forceCanvasRender();
    }, 150);
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

        const source = await streamlabsOBS.v1.Sources.createAppSource(sourceDisplayName, 'bb-webcam-frame');
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