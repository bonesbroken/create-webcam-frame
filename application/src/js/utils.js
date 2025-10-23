import $ from "jquery";
import { Rive } from "@rive-app/webgl2";
import rectangleFrame from "../rive/rectangle-frame.riv";

export const defaultWebcamFrameSettings = () => ({
    "sourceType": "webcam",
    "shape": "rectangle",
    "aspectRatio": "16:9",
    'rotation': 0,
    'borderRadius': 10,
    'color': '#ff0000',
    'strokeWidth': 5
});

export function loadWebcamRiveFile(canvas, settings) {
    let riveInstance = new Rive({
        src: rectangleFrame,
        stateMachines: "State Machine 1",
        canvas: canvas,
        // layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        autoplay: true,
        // useOffscreenRenderer: true,
        autoBind: true,
        onLoad: () => {
            riveInstance.resizeDrawingSurfaceToCanvas();
            updateRiveProperties(riveInstance, settings);
        }
    });

    return riveInstance;
}

export function updateRiveProperties(instance, settings) {
    // Update the Rive viewmodel properties with current settings
    if (instance && instance.viewModelInstance) {
        // Update Rive properties based on settings
        const vmi = instance.viewModelInstance;
        instance.viewModelInstance.properties.forEach(input => {
            if (input.name === 'rotation' && settings.rotation !== undefined) {
                vmi.number(input.name).value = settings[input.name];
            }
            if (input.name === 'borderRadius' && settings.borderRadius !== undefined) {
                vmi.number(input.name).value = settings[input.name];
            }
            if (input.name === 'strokeWidth' && settings.strokeWidth !== undefined) {
                vmi.number(input.name).value = settings[input.name];
            }
            if (input.name === 'color' && settings.color !== undefined) {
                vmi.color(input.name).value = hexToArgbInt(settings[input.name]);
            }
            if (input.name === 'Enum property' && settings['aspectRatio'] !== undefined) {
                vmi.enum(input.name).value = settings['aspectRatio'];
            }
        });
        
    }
}

function hexToArgbInt(hex, alpha = 0xFF) {
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