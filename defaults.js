
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio Code
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
//Default values and presets - no knowledge of anything else in the code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const smallestLevel=-100;//db
const zeroLevel=Math.pow(10,smallestLevel/20);//-100db global minimum level for calculations

const allowedOversampleTimes = [1,2,3,4,6,8,12,16];

const defaultTestSubjectList = 
[
    "rootPhaseDelay"
];


let wavePresets = [
    {
        name:"default", 
        patch:{
            balance:0,
            oddLevel:1,
            oddFalloff:1.8,
            oddAlt:0,
            evenLevel:-1,
            evenFalloff:1.8,
            evenAlt:0,
            sinCos:0,
            altW:0.5,
            altOffset:0,
        }
    },
    {
        name:"square", 
        patch:{
            balance:0,
            oddLevel:1,
            oddFalloff:1,
            oddAlt:0,
            evenLevel:0,
            evenFalloff:1,
            evenAlt:0,
            sinCos:0,
            altW:0.5,
            altOffset:0,
        }
    },
    {
        name:"Saw", 
        patch:{
            balance:0,
            oddLevel:1,
            oddFalloff:1,
            oddAlt:0,
            evenLevel:-1,
            evenFalloff:1,
            evenAlt:0,
            sinCos:0,
            altW:0.5,
            altOffset:0,
        }
    },
    {
        name:"Triangle", 
        patch:{
            balance:0,
            oddLevel:1,
            oddFalloff:2,
            oddAlt:1,
            evenLevel:0,
            evenFalloff:1,
            evenAlt:0,
            sinCos:0,
            altW:0.5,
            altOffset:0,
        }
    },
    {
        name:"stairs", 
        patch:{
            balance:0,
            oddLevel:1,
            oddFalloff:1,
            oddAlt:0,
            evenLevel:1,
            evenFalloff:1,
            evenAlt:0.5,
            sinCos:0,
            altW:0.5,
            altOffset:1,
        }
    },
    {
        name:"pulse", 
        patch:{
            balance:0,
            oddLevel:1,
            oddFalloff:1,
            oddAlt:1,
            evenLevel:1,
            evenFalloff:1,
            evenAlt:1,
            sinCos:1,
            altW:0.75,
            altOffset:0,
        }
    },
    {
        name:"sine", 
        patch:{
            balance:-1,
            oddLevel:1,
            oddFalloff:1,
            oddAlt:0,
            evenLevel:0,
            evenFalloff:1,
            evenAlt:0,
            sinCos:0,
            altW:0.5,
            altOffset:0,
        }
    }
];

let envelopePresets = [
    {
        name:"default",
        patch:{
            attack:0.005,
            hold:0,
            decay:0.4,
            envelopeFilter:150,
        }
    },
    {
        name:"Short",
        patch:{
            attack:0.001,
            hold:0,
            decay:0.05,
            envelopeFilter:1000,
        }
    },
    {
        name:"Slow",
        patch:{
            attack:0.05,
            hold:0,
            decay:0.5,
            envelopeFilter:150,
        }
    },
    {
        name:"Tone",
        patch:{
            attack:0.01,
            hold:0.5,
            decay:0.1,
            envelopeFilter:0,
        }
    },
    {
        name:"View",
        patch:{
            attack:0.001,
            hold:0.15,
            decay:0.01,
            envelopeFilter:0,
        }
    },

];

let distortionPresets = [
    {
        name:"default",
        patch:{
            distortion:0,
            oddDistortion:0,
            evenDistortion:0,
            clipDistortion:0,
            tanhDistortion:0.4,
            jitter:0,
        }
    },
    {
        name:"Light",
        patch:{
            distortion:0.2,
            oddDistortion:0,
            evenDistortion:0,
            clipDistortion:0,
            tanhDistortion:0.4,
            jitter:0,
        }
    },
    {
        name:"Heavy",
        patch:{
            distortion:0.5,
            oddDistortion:0.5,
            evenDistortion:0.1,
            clipDistortion:0,
            tanhDistortion:0.7,
            jitter:0,
        }
    },
    {
        name:"Jitter",
        patch:{
            distortion:1,
            oddDistortion:0,
            evenDistortion:0,
            clipDistortion:0,
            tanhDistortion:0,
            jitter:0.8,
            oversampleTimes:0,//How many times samplerate is raised, index into allowedOversampleTimes [1,2,3,4,6,8,12,16]
            oversampleStopDepth:0.5,//-70db to -110db - default = -90db
            oversampleTransition:0.5
        }
    },
];


let oversamplingPresets = [
    {
        name:"default",
        patch:{
            oversampleTimes:1,//How many times samplerate is raised, index into allowedOversampleTimes [1,2,3,4,6,8,12,16]
            oversampleStopDepth:0.5,//-70db to -110db - default = -90db
            oversampleTransition:0.7
        }
    },
    {
        name:"Mid CPU",
        patch:{
            oversampleTimes:3,//How many times samplerate is raised, index into allowedOversampleTimes [1,2,3,4,6,8,12,16]
            oversampleStopDepth:0.5,//-70db to -110db - default = -90db
            oversampleTransition:0.5
        }
    },
    {
        name:"Hi-Q",
        patch:{
            oversampleTimes:5,//How many times samplerate is raised, index into allowedOversampleTimes [1,2,3,4,6,8,12,16]
            oversampleStopDepth:0.6,//-70db to -110db - default = -90db
            oversampleTransition:0.2
        }
    },
    {
        name:"Off",
        patch:{
            oversampleTimes:0,//How many times samplerate is raised, index into allowedOversampleTimes [1,2,3,4,6,8,12,16]
            oversampleStopDepth:0.5,//-70db to -110db - default = -90db
            oversampleTransition:0.5
        }
    },
];

let filterPresets = [
    {   
        name:"default",
        patch:{
            filterF1:10,
            filterF2:10,
            filterF3:8,
            attackF:0.005,
            holdF:0,
            decayF:0.2,
            filterSlope:12,
            filterPeak:12,
        }
    },    
    {   
        name:"Chirp",
        patch:{
            filterF1:10,
            filterF2:10,
            filterF3:2,
            attackF:0.005,
            holdF:0,
            decayF:0.01,
            filterSlope:24,
            filterPeak:0,
        }
    },      
    {   
        name:"Beep",
        patch:{
            filterF1:2,
            filterF2:10,
            filterF3:2,
            attackF:0.05,
            holdF:0,
            decayF:0.1,
            filterSlope:24,
            filterPeak:0,
        }
    },    
    {   
        name:"Sweep",
        patch:{
            filterF1:0,
            filterF2:10,
            filterF3:2,
            attackF:0.04,
            holdF:0,
            decayF:0.37,
            filterSlope:24,
            filterPeak:0,
        }
    },    
    {   
        name:"off",
        patch:{
            filterF1:10,
            filterF2:10,
            filterF3:2,
            attackF:0.005,
            holdF:0,
            decayF:0.01,
            filterSlope:0,
            filterPeak:0,
        }
    }


]

function getDefaultPatch(){
    return {
        frequency: 50,//Hz
        frequencyFine: 0,//Hz
        rootPhaseDelay: 0,//-1..1 => -PI..PI for phase shift of fundamental
        higherHarmonicRelativeShift: 0,//fraction of rootPhaseDelay for phase of higher harmonics

        //Harmonic series
        balance:0,
        oddLevel: 1,//-1..1 level of odd harmonics
        oddAlt: 0,//0..1 How much the odd harmonics alternate in polarity
        oddFalloff: 1.8,//1..2 How much the odd harmonics fall off in amplitude as a power of 1/n
        evenLevel: -1,//-1..1 level of even harmonics
        evenAlt: 0,//0..1 How much the even harmonics alternate in polarity
        evenFalloff: 1.8,//1..2 How much the even harmonics fall off in amplitude as a power of 1/n,
        sinCos:0,//0..1 0 = sine wave, 1 = cosine wave, use cosine for pulse wave
        altW:0.5,//0..1 frequency of alternation - gives pulse width for pulse wave
        altOffset:0,//between 0 and 0.5 - phase offset for alternation between even and odd harmonics, needed to "sync" alternations for pulse wave

        //Amplitude envelope
        attack: 0.005,//Linear time to get to max amplitude  in seconds
        hold: 0,// time in seconds to hold max amplitude
        decay: 0.4,// time in seconds to get to 1/1024 (-60db) of start value -> exponential decay
        envelopeFilter: 150,// 0-1000 1 = no filter, 1000 = 1/1000 of heaviest filter
        envMode: 1,//1,2 - 1 = delay envelope by same as phase delay, 2 = envelope fixed, shift phase in place

        filterF1:10,// 0..10 20*2^(x)
        filterF2:10,// 0..10 20*2^(x)
        filterF3:8,// 0..10 20*2^(x)
        attackF: 0.005,//Linear time to get to max amplitude  in seconds
        holdF: 0,// time in seconds to hold max amplitude
        decayF: 0.2,// time in seconds to get to 1/1024 (-60db) of start value -> exponential decay
        filterSlope:12,//db/octave, 0=off
        filterPeak:0,//0..1 0 = no peak, 1 = 24db peak

        distortion:0,//0..1 0 = off, 1 = max distortion
        oddDistortion:0,//Third order Chebyshev polynomial distortion
        evenDistortion:0,//second order Chebyshev polynomial distortion
        clipDistortion:0,//0..1 0 = off, 1 = max distortion
        tanhDistortion:0.4,//0= off

        oversampleTimes:1,//How many times samplerate is raised, index into allowedOversampleTimes [1,2,3,4,6,8,12,16]
        oversampleStopDepth:0.5,//-70db to -110db - default = -90db
        oversampleTransition:0.7//0.005 + 0.025 *patch.oversampleTransition * samplerate so between 0.475 and 0.500 of samplerate
    }
}


function getDefaultAPatch(){
    let patch = getDefaultPatch();
    patch.rootPhaseDelay=0;
    return patch;
}
function getDefaultBPatch(){
    let patch = getDefaultPatch();
    patch.rootPhaseDelay=0.25;
    return patch;
}