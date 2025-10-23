import $ from "jquery";
import { Rive } from "@rive-app/webgl2";
import webcamFrame from "../rive/webcam-frame.riv";

export const defaultWebcamFrameSettings = () => ({
    "shape": "rectangle",
    "aspectRatio": "16:9",
    'rotation': 0,
    'borderRadius': 10,
    'outerRadius': 50,
    'color': '#9cbcfa',
    'strokeWidth': 45,
    'points': 5,
    'fillColor': '#101026'
});

export function loadWebcamRiveFile(canvas, settings, transparent = false) {
    // Select the appropriate Rive file based on the shape

    let riveInstance = new Rive({
        src: webcamFrame,
        stateMachines: "State Machine 1",
        canvas: canvas,
        // layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        autoplay: true,
        // useOffscreenRenderer: true,
        autoBind: true,
        onLoad: () => {
            riveInstance.resizeDrawingSurfaceToCanvas();
            updateRiveProperties(riveInstance, settings, transparent);
        }
    });

    return riveInstance;
}

export function updateRiveProperties(instance, settings, transparent = false) {
    // Update the Rive viewmodel properties with current settings
    if (instance && instance.viewModelInstance) {
        // Update Rive properties based on settings
        const vmi = instance.viewModelInstance;
        instance.viewModelInstance.properties.forEach(input => {
            if (input.name === 'rotation' && settings['rotation'] !== undefined) {
                vmi.number('rotation').value = settings['rotation'];
            }
            if (input.name === 'borderRadius' && settings['borderRadius'] !== undefined) {
                vmi.number('borderRadius').value = settings['borderRadius'];
            }
            if (input.name === 'points' && settings['points'] !== undefined) {
                vmi.number('points').value = settings['points'];
            }
            if (input.name === 'outerRadius' && settings['outerRadius'] !== undefined) {
                vmi.number('outerRadius').value = settings['outerRadius'];
            }
            if (input.name === 'strokeWidth' && settings['strokeWidth'] !== undefined) {
                vmi.number('strokeWidth').value = settings['strokeWidth'];
            }
            if (input.name === 'color' && settings['color'] !== undefined) {
                vmi.color('color').value = hexToArgbInt(settings['color']);
            }
            if (input.name === 'fillColor' && settings['fillColor'] !== undefined) {
                if(transparent) {
                    vmi.color('fillColor').value = hexToArgbInt(settings['fillColor'], 0x00);
                } else {
                    vmi.color('fillColor').value = hexToArgbInt(settings['fillColor']);
                }
            }
            if (input.name === 'aspectRatio' && settings['aspectRatio'] !== undefined) {
                vmi.enum('aspectRatio').value = settings['aspectRatio'];
            }
            if (input.name === 'shape' && settings['shape'] !== undefined) {
                vmi.enum('shape').value = settings['shape'];
            }
        });
        
    }
}

export function hexToArgbInt(hex, alpha = 0xFF) {
    const h = String(hex || '').replace(/^#/, '').trim();
    let r = 255, g = 255, b = 255, a = alpha & 0xFF;
    if (h.length === 3) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
    } else if (h.length === 6) {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
    } else if (h.length === 8) {
        // If 8 chars, treat as RRGGBBAA
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
        a = parseInt(h.slice(6, 8), 16) & 0xFF;
    }
    return ((a & 0xFF) << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
}