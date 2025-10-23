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
let selectedType = null;
const totalSteps = 3;

// Make selectedType globally accessible
window.selectedType = null;

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
    if (selectedType !== 'webcam') return;
    
    // Find the currently visible canvas
    let targetCanvas = null;
    
    if (currentStep === 3) {
        targetCanvas = document.getElementById('webcamCanvasStep3');
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

// Helper function to get current settings based on selected type
function getCurrentSettings() {
    return webcamSettings;
}

// Helper function to update current settings based on selected type
function updateCurrentSettings(newSettings) {
    webcamSettings = { ...webcamSettings, ...newSettings };
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
                        selectedType = 'webcam'; // Default type for existing sources
                        window.selectedType = selectedType; // Update global reference
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

    $('#rotation').val(Number(settings["rotation"]));
    $('#borderRadius').val(Number(settings["borderRadius"]));
    $('#strokeWidth').val(Number(settings["strokeWidth"] || 2));
    $('#aspectRatio').val(settings["aspectRatio"]);
    $('#color').val(settings["color"]);
    $('#colorInput').val(settings["color"]);

    if(newSource === 'new') {
        $('#saveAppSource').hide();
    } else {
        $('#saveAppSource').show();
    }
    
    // Update step 3 instructions if currently on step 3
    if (currentStep === 3) {
        updateStep3Instructions();
    }
}

$('#color').off('sl-change');
$('#color').on('sl-change', event => {
    const val = event.target && event.target.value;
    if (val === undefined) return;
    
    const currentSettings = getCurrentSettings();
    const fieldId = $(event.target).attr('id');
    currentSettings[fieldId] = val;
    updateCurrentSettings({ [fieldId]: val });
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
    
    const currentSettings = getCurrentSettings();
    currentSettings.color = val;
    updateCurrentSettings({ color: val });
    
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
    
    const currentSettings = getCurrentSettings();
    currentSettings.borderRadius = numeric;
    updateCurrentSettings({ borderRadius: numeric });
    
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
    
    const currentSettings = getCurrentSettings();
    currentSettings.strokeWidth = numeric;
    updateCurrentSettings({ strokeWidth: numeric });
    
    // Update Rive viewmodel for webcam
    safeUpdateRiveProperties(webcamSettings);
});


$('#aspectRatio').off('sl-change');
$('#aspectRatio').on('sl-change', event => {
    const val = event.target && event.target.value;
    if (!val) return;

    const currentSettings = getCurrentSettings();
    currentSettings["aspectRatio"] = val;
    updateCurrentSettings({ "aspectRatio": val });
    
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
            const currentSettings = getCurrentSettings();
            currentSettings.customImageUrl = result[`${selectedFile.name}_${String(selectedFile.lastModified)}`];
            updateCurrentSettings({ customImageUrl: currentSettings.customImageUrl });
            
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


// Map of field IDs to their display labels
const fieldLabels = {
    'rotation': 'Rotation'
};

$("sl-range").off('sl-change');
$("sl-range").on('sl-change', event => {
    const value = event.target && event.target.value;
    if (value === undefined) return;

    const numeric = Number(value);
    const fieldId = $(event.target).attr('id');
    
    const currentSettings = getCurrentSettings();
    currentSettings[fieldId] = numeric;
    updateCurrentSettings({ [fieldId]: numeric });
    
    if (selectedType === 'keyboard') {
        //generateWebcamFrame(keyboardSettings);
    } else {
        safeUpdateRiveProperties(webcamSettings);
    }
});


$("#saveAppSource").on('click', () => { 
    if(!canAddSource) return;

    if(existingSource) {
        const currentSettings = getCurrentSettings();
        //streamlabsOBS.v1.Sources.updateSource({id: existingSource, name: title});
        streamlabsOBS.v1.Sources.setAppSourceSettings(existingSource, JSON.stringify(currentSettings));
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
    const settings = getCurrentSettings();
    const rotation = settings.rotation || 0;
    const borderRadius = settings.borderRadius || 10;
    const color = settings.color || '#ffffff';
    const strokeWidth = settings.strokeWidth || 5;
    const aspectRatio = settings.aspectRatio || '16:9';
    
    // Calculate frame dimensions based on aspect ratio
    let frameWidth, frameHeight;
    switch(aspectRatio) {
        case '16:9':
            frameWidth = size * 0.8;
            frameHeight = frameWidth * (9/16);
            break;
        case '4:3':
            frameWidth = size * 0.8;
            frameHeight = frameWidth * (3/4);
            break;
        case '1:1':
            frameWidth = size * 0.8;
            frameHeight = frameWidth;
            break;
        default:
            frameWidth = size * 0.8;
            frameHeight = frameWidth * (9/16);
    }
    
    // Clear canvas with transparent background
    ctx.clearRect(0, 0, size, size);
    
    // Move to center and apply rotation
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    
    // Draw the frame shape
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    
    // Draw rounded rectangle
    const x = -frameWidth / 2;
    const y = -frameHeight / 2;
    
    ctx.beginPath();
    ctx.roundRect(x, y, frameWidth, frameHeight, borderRadius);
    ctx.fill();
    
    if (strokeWidth > 0) {
        ctx.stroke();
    }
    
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
        link.download = 'webcam-frame-mask.png';
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

function updateStep3Instructions() {
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
    // Handle step 2 canvases
    const webcamCanvas = document.getElementById('webcamCanvas');
    const keyboardCanvas = document.getElementById('keyboardCanvas');
    
    // Handle step 3 canvases
    const webcamCanvasStep3 = document.getElementById('webcamCanvasStep3');
    const keyboardCanvasStep3 = document.getElementById('keyboardCanvasStep3');
    
    if (selectedType === 'keyboard') {
        // Step 2
        if (webcamCanvas && keyboardCanvas) {
            webcamCanvas.style.display = 'none';
            keyboardCanvas.style.display = 'block';
        }
        // Step 3
        if (webcamCanvasStep3 && keyboardCanvasStep3) {
            webcamCanvasStep3.style.display = 'none';
            keyboardCanvasStep3.style.display = 'block';
        }
    } else {
        // Step 2
        if (webcamCanvas && keyboardCanvas) {
            webcamCanvas.style.display = 'block';
            keyboardCanvas.style.display = 'none';
        }
        // Step 3
        if (webcamCanvasStep3 && keyboardCanvasStep3) {
            webcamCanvasStep3.style.display = 'block';
            keyboardCanvasStep3.style.display = 'none';
        }
    }
}

function forceCanvasRender() {
    if (selectedType === 'keyboard') {
        // Render on keyboard canvases
        const canvas2 = document.getElementById('keyboardCanvas');
        const canvas3 = document.getElementById('keyboardCanvasStep3');
        
        if (canvas2 && canvas2.offsetParent) {
            //generateWebcamFrame(keyboardSettings);
            console.log('Forced canvas render for keyboard step 2');
        }
        if (canvas3 && canvas3.offsetParent) {
            //generateWebcamFrame(keyboardSettings);
            console.log('Forced canvas render for keyboard step 3');
        }
    } else {
        // Render on webcam canvases
        const canvas2 = document.getElementById('webcamCanvas');
        const canvas3 = document.getElementById('webcamCanvasStep3');
        
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
}

// Helper function to create new Rive instances
function createNewRiveInstances(canvas2, canvas3) {
    const visibleCanvases = [];
    
    if (canvas2 && canvas2.offsetParent && canvas2.style.display !== 'none') {
        visibleCanvases.push({ canvas: canvas2, step: 2 });
    }
    
    if (canvas3 && canvas3.offsetParent && canvas3.style.display !== 'none') {
        visibleCanvases.push({ canvas: canvas3, step: 3 });
    }
    
    // Only create instances for visible canvases
    visibleCanvases.forEach(({ canvas, step }) => {
        try {
            console.log(`Creating Rive instance for webcam step ${step}`);
            const instance = loadWebcamRiveFile(canvas, webcamSettings);
            riveInstances.push(instance);
        } catch (error) {
            console.error(`Error creating Rive instance for step ${step}:`, error);
        }
    });
}

// Wizard Functions
function initWizard() {
    // Step 1: Type selection
    $('.option-card').on('click', function() {
        $('.option-card').removeClass('selected');
        $(this).addClass('selected');
        selectedType = $(this).data('type');
        window.selectedType = selectedType; // Update global reference
        $('#step1Next').prop('disabled', false);
        
        // Update type display in later steps
        $('#selectedType, #selectedType2').text(selectedType);
    });
    
    // Navigation handlers
    $('#step1Next').on('click', () => goToStep(2));
    $('#step2Back').on('click', () => goToStep(1));
    $('#step2Next').on('click', () => goToStep(3));
    $('#step3Back').on('click', () => goToStep(2));
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
    const currentSettings = getCurrentSettings();
    updateUI(currentSettings, existingSource ? 'existing' : 'new');
    
    // Update step 3 instructions based on available actions
    if (step === 3) {
        updateStep3Instructions();
        // Force canvas rendering for step 3
        setTimeout(() => {
            forceCanvasRender();
        }, 150);
    }
    
    // Generate frame when we reach step 2 or 3
    if (step >= 2) {
        // Switch to appropriate canvas based on selected type
        switchCanvas();
        
        // Small delay to ensure canvas is rendered
        if (selectedType === 'keyboard') {
                //generateWebcamFrame(keyboardSettings);
        } else {
            if (riveInstances.length === 0) {
                const canvas = document.getElementById('webcamCanvas');
                if (canvas) {
                    riveInstances.push(loadWebcamRiveFile(canvas, webcamSettings));
                }
            } else {
                safeUpdateRiveProperties(webcamSettings);
            }
        }
    }
}

// Scene Selection Modal Functions
function openSceneSelectionModal() {
    // Show modal first
    $('#sceneModal').addClass('active');
    selectedSceneId = null;
    $('#sceneModalConfirm').removeClass('visible');
    
    // Update modal text based on selected type
    const typeText = selectedType === 'keyboard' ? 'Keyboard Overlay' : 
                    selectedType === 'webcam' ? 'Webcam Frame' : 'source';
    const capitalizedType = selectedType === 'keyboard' ? 'Keyboard Overlay' : 
                           selectedType === 'webcam' ? 'Webcam Frame' : 'Source';
    $('#sourceTypeInSubtitle').text(typeText.toLowerCase());
    $('#sourceTypeInButton').text(capitalizedType);
    
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
        const sourceDisplayName = selectedType === 'keyboard' ? 'Keyboard Overlay' : 
                                 selectedType === 'webcam' ? 'Webcam Frame' : 'Webcam Frame';

        const sourceIDName = selectedType === 'keyboard' ? 'bb-keyboard-overlay' : 
                                 selectedType === 'webcam' ? 'bb-webcam-frame' : 'bb-webcam-frame';
        const currentSettings = getCurrentSettings();
        const source = await streamlabsOBS.v1.Sources.createAppSource(sourceDisplayName, sourceIDName);
        await streamlabsOBS.v1.Sources.setAppSourceSettings(source.id, JSON.stringify(currentSettings));
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