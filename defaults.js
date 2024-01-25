
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

let wavePresets = [
    {
        name:"default", 
        patch:{
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

let filterPresets = [
    {   
        name:"default",
        patch:{
            filterF1:10,
            filterF2:10,
            filterF3:5,
            attackF:0.005,
            holdF:0,
            decayF:0.2,
            filterSlope:12,
            filterPeak:0,
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
        name:"Test",
        patch:{
            filterF1:0,
            filterF2:10,
            filterF3:2,
            attackF:0.04,
            holdF:0,
            decayF:0.08,
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
        rootPhaseDelay: 0,//-1..1 => -PI..PI for phase shift of fundamental
        higherHarmonicRelativeShift: 0,//fraction of rootPhaseDelay for phase of higher harmonics

        //Harmonic series
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
        filterF3:5,// 0..10 20*2^(x)
        attackF: 0.005,//Linear time to get to max amplitude  in seconds
        holdF: 0,// time in seconds to hold max amplitude
        decayF: 0.2,// time in seconds to get to 1/1024 (-60db) of start value -> exponential decay
        filterSlope:12,//db/octave, 0=off
        filterPeak:0,//0..1 0 = no peak, 1 = 24db peak
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