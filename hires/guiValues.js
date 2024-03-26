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

import { allowedOversampleTimes } from '../sharedAudio/defaults.js';
import { getTrueSampleRate } from './audioApi.js';



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
        
        case "sampleMix":
            ve.textContent =toPercent(patch.sampleMix);break;
        case "sampleTrim":
            ve.textContent =patch.sampleTrim.toFixed(1)+'db';break;   


        case "distortion":
            if (patch.distortion==0)
            {
                ve.innerHTML = "<b>off</b>";
            }
            else
            {
                ve.innerHTML = toPercent(patch.distortion);
            }
            break;
        case "oddDistortion":
            ve.innerHTML =toPatchDistortion(patch.oddDistortion, patch.distortion);break;
        case "clipDistortion":
            ve.innerHTML =toPatchDistortion(patch.clipDistortion, patch.distortion);break;
        case "hyperbolicDistortion":
            ve.innerHTML =toPatchDistortion(patch.hyperbolicDistortion, patch.distortion);break;
        case "tanhDistortion":
            ve.innerHTML =toPatchDistortion(patch.tanhDistortion, patch.distortion);break;
        case "speakerAmount":
            ve.innerHTML =toPatchDistortion(patch.speakerAmount, patch.distortion);break;
        case "speakerMass":
            ve.textContent =(100 * patch.speakerMass).toFixed(1);break;
        case "speakerDamping":
            ve.textContent =(patch.speakerDamping).toFixed(2);break;
        case "speakerStiffness":
            ve.textContent =(0.5 +4 *patch.speakerStiffness).toFixed(2);break;
        case "speakerNonLinearity":
            ve.textContent =(10*patch.speakerNonLinearity).toFixed(1);break;


        case "naughtyFilterQ": 
            const f_20 = Math.min(250,Math.pow(10,3*patch.naughtyFilterFreq)); // Frequency/ 20 
            const Q =1 + 1.5*(f_20-1) *patch.naughtyFilterQ; //See naughtyFilter.js for the formula
            ve.textContent =Q.toFixed(3-Math.log10(f_20));break;
        case "naughtyFilterGain": 
            ve.textContent =(patch.naughtyFilterGain).toFixed(1)+'db';break;
        case "naughtyFilterFreq": 
            ve.textContent =(20*Math.pow(10,3*patch.naughtyFilterFreq)).toFixed(0)+'Hz';break;
        case "naughtyFilterMix": 
            ve.textContent =toPercent(patch.naughtyFilterMix);break;

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
            ve.textContent =patch.attenuation===0? "off" :  (-20*Math.log10(patch.attenuation*patch.attenuation)).toFixed(2)+'db ' + (patch.attenuationPhase<0.5? "0°":"180°");break;

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

        case "inharmonicNoise":
            ve.innerHTML = 
            '<div class=""><span class="tinyLabelFull">'+
                toInharmonicString(patch.inharmonicNoiseLevel,
                    patch.inharmonicNoiseColour==0?"White" :(patch.inharmonicNoiseColour==1?"Pink": "-"+(patch.inharmonicNoiseColour*3).toFixed(1)+"db")
                    )+'</span></div>';break;
        case "inharmonicA":
            ve.innerHTML =
            '<div class=""><span class="tinyLabelFull">'+
                toInharmonicString(
                    patch.inharmonicALevel, 
                    patch.inharmonicAFrequency.toFixed(0)+'Hz')+'</span></div>';
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
        case "inharmonicD": //Only used in high sample rate tests
                ve.innerHTML =
                '<div class=""><span class="tinyLabelFull">'+
                    toInharmonicString(
                        patch.inharmonicDLevel, 
                        patch.inharmonicDFrequency.toFixed(0)+'Hz')+'</span></div>';
                break;
        case "inharmonicE": //Only used in high sample rate tests
                ve.innerHTML =
                '<div class=""><span class="tinyLabelFull">'+
                    toInharmonicString(
                        patch.inharmonicELevel, 
                        patch.inharmonicEFrequency.toFixed(0)+'Hz')+'</span></div>';
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
        case "ultraSonicReferenceLevel": //Only used in high sample rate tests
                ve.textContent = toPercent(patch.ultraSonicReferenceLevel);
                break;
            case "ultraSonicCutlevel": //Only used in high sample rate tests
                    ve.textContent = toPercent(patch.ultraSonicCutlevel);
                    break;
        case "ultraSonicCutOff": //Only used in high sample rate tests
                ve.textContent =patch.ultraSonicCutOff==0?"off" : (patch.ultraSonicCutOff/1000).toFixed(2)+'kHz';
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


function toPatchDistortion(value, distortion){
    if (distortion==0) return "off";
    return '<div >'+(value*100).toFixed(0) +'% <span class="tinyLabel"></span></div>';
    //return '<small>'+ (value*100).toFixed(0) +' ('+(value * distortion).toFixed(Math.max(2,Math.min(4,-Math.round(Math.log(distortion)*2)))) +')</small>';
}

export { setValueFromPatch};