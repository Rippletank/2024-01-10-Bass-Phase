//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Handles GUI specifics that relate to the patch values and what they mean
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//This code is not optimised for performance - it is intended to be fairly easy to understand and modify
//It is not intended to be used in production code
//Copyright N.Whitehurst 2024
//https://github.com/Rippletank/2024-01-10-Bass-Phase
//MIT License - use as you wish, but no warranty of any kind, express or implied, is provided with this software
//Code was written with the help of Github Copilot, particularly for UI/CSS stuff and some mundane refactoring chores
//Web Audio API documentation: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API & https://mdn.github.io/webaudio-examples/voice-change-o-matic/ for FFT
//Wikipedia for refresher on harmonic series and related
//Quick IIF refresher and general approach for suitable smoothing values https://zipcpu.com/dsp/2017/08/19/simple-filter.html
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Knows about the meaning values in the patch and can translate them into meaningful values for the GUI
//Allows for units and non-linear scales etc
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

import { allowedOversampleTimes } from './defaults.js';
import { getCanvasTooltips } from './painting.js';
import { repaintDetailedFFT, getTrueSampleRate } from './audioAPI.js';


const disableGroups =[
    {
        mains:[
            {
                name:"distortion",
                value:0,
            }
        ],
        dependents:[
            "oddDistortion",
            "tanhDistortion",
            "hyperbolicDistortion",
            "clipDistortion",
            "oversampleTimes",
            "oversampleStopDepth",
            "oversampleTransition",
            "ultrasonicFrequency",
            "speakerAmount"
        ]
    },
    {
        mains:[
            {
                name:"filterSlope",
                value:0,
            }
        ],
        dependents:[
            "filterF1",
            "filterF2",
            "filterF3",
            "attackF",
            "holdF",
            "decayF"
        ]
    },
    {
        mains:[
            {
                name:"evenAlt",
                value:0,
                matchAny:false
            },
            {
                name:"oddAlt",
                value:0,
                matchAny:false
            }
        ],
        dependents:[
            "altW",
            "altOffset"
        ]
    },
    {
        mains:[
            {
                name:"distortion",
                value:0,
                matchAny:true
            },
            {
                name:"speakerAmount",
                value:0,
                matchAny:true
            }
        ],
        dependents:[
            "speakerMass",
            "speakerDamping",
            "speakerStiffness",
            "speakerNonLinearity"
        ]
    },
    {
        mains:[
            {
                name:"oddLevel",
                value:0,
            },
        ],
        dependents:[
            "oddAlt",
            "oddFalloff"
        ]
    },
    {
        mains:[
            {
                name:"evenLevel",
                value:0,
            },
        ],
        dependents:[
            "evenAlt",
            "evenFalloff"
        ]
    },


];


function setValueFromPatch(ve, patch){
    switch (ve.name) {
        case "frequency": 
            ve.textContent = (patch.frequency+patch.frequencyFine) .toFixed(2) + "Hz";
            break;
            case "frequencyFine": 
                ve.textContent = (patch.frequencyFine) .toFixed(2) + "Hz";
                break;
        case "higherHarmonicRelativeShift": 
            ve.textContent = toPercent(patch.higherHarmonicRelativeShift);
            break;
        case "odd": 
            ve.textContent = getPartialLevelLabel(patch.oddLevel,patch.oddAlt);
            break;
        case "even": 
            ve.textContent = getPartialLevelLabel(patch.evenLevel, patch.evenAlt);
            break;
        case "oddFalloff": 
            ve.innerHTML = toFalloffString(patch.oddFalloff);
            break;
        case "evenFalloff":
            ve.innerHTML = toFalloffString(patch.evenFalloff);
            break;
            break;
        case "altW":
            ve.innerHTML = "Every "+ toReciprocal(patch.altW) +" steps &nbsp; (Duty: " +toPercent(patch.altW)+")";
            break;
        case "altOffset":
            let isInt = Math.round(patch.altOffset) ==patch.altOffset;
            let valText = patch.altOffset.toFixed(1);
            if (isInt){
                switch(patch.altOffset){
                    case -1: valText =valText + ' step &nbsp; Even -↔+ &nbsp; Odd 0↔0';break;
                    case 0: valText =valText +  ' steps &nbsp; Even 0↔0 &nbsp; Odd +↔-';break;
                    case 1: valText = valText + ' step &nbsp; Even +↔- &nbsp; Odd 0↔0';break;
                }
            }
            else{
                valText =valText +' steps &nbsp;&nbsp; both';
            }
            ve.innerHTML = valText;
            break;
        case "sinCos":
            let type = "&nbsp;";
            if (patch.sinCos==0) type = "sin(t)";
            if (patch.sinCos==-1) type = "-cos(t)";
            if (patch.sinCos==1) type = "cos(t)";
            ve.innerHTML = (patch.sinCos*0.5).toFixed(2)+'π &nbsp;&nbsp; '+type;
            break;
        case "balance": 
            if (patch.balance==0) 
            {
                ve.textContent = "-";
            }
            else if (patch.balance==1) 
            {
                ve.textContent = "higher only";
            }
            else if (patch.balance==-1) 
            {
                ve.textContent = "1st only";
            }
            else if (patch.balance>0) 
            {
                let db = patch.balance*patch.balance*75;
                ve.textContent = "1st "+(-db).toFixed(db<3?2:1 )+"db";                    
            }
            else if (patch.balance<0) 
            {
                let db = patch.balance*patch.balance*75;
                ve.textContent = "high "+(-db).toFixed(db<3?2:1)+"db";                    
            }
            break;
        case "aliasing":
            if (patch.aliasing==0) 
            {
                ve.textContent = "off";
            }
            else
            {
                ve.textContent = (1+patch.aliasing).toFixed(1) + "x Nyquist";
            }
            break;
        break;
        case "attack": ve.textContent = patch.attack + "s";break;  
        case "decay": ve.textContent = patch.decay + "s";break;
        case "hold": ve.textContent = patch.hold + "s";break;
        case "envelopeFilter": 
            if (patch.envelopeFilter==0) 
                {
                    ve.innerHTML = "<b>OFF</b>";
                }
                else
                {
                    ve.textContent = patch.envelopeFilter.toFixed(0);
                }
            break;


        case "attackF": ve.textContent = patch.attackF + "s";break;  
        case "decayF": ve.textContent = patch.decayF + "s";break;
        case "holdF": ve.textContent = patch.holdF + "s";break;
        case "filterF1": ve.textContent = toFilterFreq(patch.filterF1);break;
        case "filterF2": ve.textContent = toFilterFreq(patch.filterF2);break;
        case "filterF3": ve.textContent = toFilterFreq(patch.filterF3);break;
        case "filterSlope": 
        if (patch.filterSlope==0) 
            {
                ve.innerHTML = "<b>OFF</b>";
            }
            else
            {
                ve.textContent = patch.filterSlope.toFixed(0)+"db/oct";
            }
        break;

        case "rootPhaseDelay": 
            ve.innerHTML =getPhaseLabel(patch);break;
        
        case "distortion":
            if (patch.distortion==0)
            {
                ve.innerHTML = "<b>off</b>";
            }
            else
            {
                ve.textContent = toPercent(patch.distortion);
            }
            break;
        case "oddDistortion":
            ve.textContent =toPercent(patch.oddDistortion);break;
        case "asymDistortion":
            ve.textContent =toPercent(patch.asymDistortion);break;
        case "clipDistortion":
            ve.textContent =toPercent(patch.clipDistortion);break;
        case "hyperbolicDistortion":
            ve.textContent =toPercent(patch.hyperbolicDistortion);break;
        case "tanhDistortion":
            ve.textContent =toPercent(patch.tanhDistortion);break;
        case "speakerAmount":
            ve.textContent =toPercent(patch.speakerAmount);break;
        case "speakerMass":
            ve.textContent =toPercent(patch.speakerMass);break;
        case "speakerDamping":
            ve.textContent =toPercent(patch.speakerDamping);break;
        case "speakerStiffness":
            ve.textContent =toPercent(patch.speakerStiffness);break;
        case "speakerNonLinearity":
            ve.textContent =toPercent(patch.speakerNonLinearity);break;


        case "jitterADC": 
            ve.textContent =toPercent(patch.jitterADC);break;
        case "jitterDAC": 
            ve.textContent =toPercent(patch.jitterDAC);break;
        case "jitterPeriodic": 
            ve.textContent =toPercent(patch.jitterPeriodic);break;

        case "digitalBitDepth":
            ve.textContent =patch.digitalBitDepth==25? "off" : patch.digitalBitDepth.toFixed(0)+"bit";
            break;

        case "digitalDitherLevel":
            let rmsFactor = 1;
            let includeBits = true;
            switch(Math.round(patch.digitalDitherType)){
                case 0: 
                    rmsFactor = 1;
                    includeBits = true;
                    break;
                case 1: 
                    rmsFactor = 0.408;
                    includeBits = true;
                    break;
                case 2: 
                    rmsFactor = 0.408;
                    includeBits = false;
                    break;
            }
            if (patch.digitalDitherLevel==0){
                ve.textContent ="off";
            }
            else
            {
                let rms = patch.digitalDitherLevel * 0.5 * rmsFactor;//0.5 since level is 0..2 meaning -1..1
                //Show only rms for gaussian dither because it is technically unbounded. Include rms in brackets for the others
                ve.textContent = (includeBits? patch.digitalDitherLevel.toFixed(1)+" bit" + (patch.digitalDitherLevel==1? "" :"s") + " [": "")
                    + rms.toFixed(2) + "rms"
                    + (includeBits? "]" :"");
            }
            break;
        case "digitalDitherFakeness":
            ve.textContent =toPercent(patch.digitalDitherFakeness);break;
        case "digitalDitherSubtract":
            ve.textContent =toPercent(patch.digitalDitherSubtract);break;
        case "digitalDitherShaping":
            ve.textContent =toPercent(patch.digitalDitherShaping);break;
        case "attenuation":
            ve.textContent =(-20*Math.log10(patch.attenuation*patch.attenuation)).toFixed(2)+'db';break;

        case "digitalDitherType":
            let ditherTypeText = "off";
            switch(Math.round(patch.digitalDitherType)){
                case 0: ditherTypeText = "Rectangular";break;
                case 1: ditherTypeText = "Triangular";break;
                case 2: ditherTypeText = "Gaussian";break;
            }
            ve.textContent =ditherTypeText;
            break;
            
        case "oversampleTimes":
            ve.textContent =allowedOversampleTimes[patch.oversampleTimes]+'x';break;
        case "oversampleStopDepth":
            ve.textContent ='-'+(70 +40 *patch.oversampleStopDepth).toFixed(0) + "db";break;
        case "oversampleTransition":
            ve.textContent =(0.005 +0.025 *patch.oversampleTransition).toFixed(3) + " of fc";break;

        case "inharmonicA":
            ve.innerHTML =
                toInharmonicString(
                    patch.inharmonicALevel, 
                    patch.inharmonicAFrequency.toFixed(0)+'Hz');
            break;
        case "inharmonicB":
            ve.innerHTML =
                toInharmonicString(
                    patch.inharmonicBLevel, 
                    patch.inharmonicBSemitones.toFixed(0)+' semitones');
            break;
        case "inharmonicC":
            ve.innerHTML =
                toInharmonicString(
                    patch.inharmonicCLevel, 
                    patch.inharmonicCSemitones.toFixed(0)+' semitones');
            break;
            break;
        case "ultrasonic":
            ve.innerHTML =patch.oversampleTimes==0?"<b>off</b>":
                toInharmonicString(
                    patch.ultrasonicLevel, 
                    (0.49
                        *getTrueSampleRate()
                        *( 1 
                            + (allowedOversampleTimes[patch.oversampleTimes]-1) 
                                * patch.ultrasonicFrequency)).toFixed(0)+' Hz');
            break;
    }
}


function toPercent(value){
    return (value*100).toFixed(0) + "%";
}   
function toReciprocal(value){
    if (value>0.5) return (1/value).toFixed(2);
    if (value>0.01) return (1/value).toFixed(1);
    if (value>0.001) return (1/value).toFixed(0);
    return "∞"
    
}

function toInharmonicString(level, pitchString){
    if (level<=-90) return "<b>off</b>";
    return level.toFixed(0) + "db &nbsp; " + pitchString;
}
function toFalloffString(value){
    let result = "";
    if (value==0) result = "1";
    else if (value==1) result = "1/n";
    else result = "1/n<sup>" + value + "</sup>";
    return result;
}

function getPartialLevelLabel(level, polarity){
    level = level ;
    polarity =polarity;
    let value = "off"
    if (level!=0)
    {
        if (polarity==0) 
            value = level.toFixed(1);
        else
            value = level.toFixed(1) +"↔" + (level *(-2 * polarity +1)).toFixed(1);
    }
    return value;
}


function getPhaseLabel(patch){
    let invFreq = 1000 / ((patch.frequency+patch.frequencyFine)  * 2);
    let rootPhaseDelay = patch.rootPhaseDelay;
    let delayA = rootPhaseDelay * invFreq;
    return rootPhaseDelay.toFixed(2) + "π <br> (" + (delayA).toFixed(1) + "ms)";
}

function toFilterFreq(x){
    return (20 * Math.pow(2,x)).toFixed(0) + "Hz";
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Setup canvas tooltips
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

document.querySelectorAll('canvas').forEach(canvas => {
    let tooltipActions = getCanvasTooltips()[canvas.id];
    if (!tooltipActions) return;//confirm exist, but this might change
    // Create a tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.pointerEvents = 'none';

    // Add the tooltip to the page
    document.body.appendChild(tooltip);

    let isDragging=false;
    let startX = 0;
    let startY = 0;
    // Add a mousemove event listener to the canvas
    canvas.addEventListener('pointermove', function(event){
        if (isDragging){
            let def = getCanvasTooltips()[canvas.id];
            let dx = event.offsetX - startX;
            let dy = event.offsetY - startY;
            startX = event.offsetX;
            startY = event.offsetY;
            def.drag(event.offsetX/canvas.clientWidth, dx/canvas.clientWidth, dy/canvas.clientHeight);
            StopEventPropagation(event);
            repaintDetailedFFT();
        }
            update(event);
    });
    
    let update =(event)=>{
        // Calculate the frequency and amplitude based on the mouse position
        const rect = canvas.getBoundingClientRect();
        const x = event.offsetX/canvas.clientWidth;
        const y = event.offsetY/canvas.clientHeight;

        let def = getCanvasTooltips()[canvas.id];

        tooltip.style.display = def.visible()?'block': 'none';

        // Update the tooltip content
        tooltip.innerHTML = def.text(x,y);

        // Position the tooltip at the mouse position
        tooltip.style.left = event.pageX - 30 + 'px';
        tooltip.style.top = event.pageY + 30 + 'px';

    };

    if (tooltipActions.doubleTap){
        canvas.addEventListener('dblclick', function(event) {
            let def = getCanvasTooltips()[canvas.id];
            if (!def || !def.visible || !def.visible()) return;
            def.doubleTap(event.offsetX/canvas.clientWidth, event.offsetY/canvas.clientHeight);
            repaintDetailedFFT();
        });
        canvas.addEventListener('wheel', function(event) {
            let def = getCanvasTooltips()[canvas.id];
            if (!def || !def.visible || !def.visible()) return;
            def.drag(event.offsetX/canvas.clientWidth, event.deltaX/canvas.clientWidth, event.deltaY/canvas.clientHeight);
            StopEventPropagation(event);
            repaintDetailedFFT();
        });
    }
    // Hide the tooltip when the mouse leaves the canvas
    canvas.addEventListener('pointerleave', function() {
        //isDragging = false;
        tooltip.style.display = 'none';
    });

    // Show the tooltip when the mouse enters the canvas
    canvas.addEventListener('pointerdown', function(event) {
        update(event);
        let def = getCanvasTooltips()[canvas.id];
        if (def.drag){
            isDragging = true;
            startX = event.offsetX;
            startY = event.offsetY;
            canvas.setPointerCapture(event.pointerId);
            StopEventPropagation(event);
        }
    });
    // Show the tooltip when the mouse enters the canvas
    canvas.addEventListener('pointerup', function(event) {
        if (isDragging){        
            isDragging = false;
            canvas.releasePointerCapture(event.pointerId); // Release the pointer
        }
    update(event);
    });

});

//https://stackoverflow.com/questions/5429827/how-can-i-prevent-text-element-selection-with-cursor-drag
function StopEventPropagation(e){
    if(e.stopPropagation) e.stopPropagation();
    if(e.preventDefault) e.preventDefault();
    e.cancelBubble=true;
    e.returnValue=false;
    return false;
}




export {disableGroups, setValueFromPatch};