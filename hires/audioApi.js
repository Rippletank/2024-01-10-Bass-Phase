import { startFFT } from "./painting.js";
import {initMushra, setNumberOfSliders, startMushra, startAudio, doSetSampleRateReporting } from "../sharedGui/mushra.js"; 
import {setMushraBufferCallback, calculateMushraBuffer, setAudioEngineSampleBuffers} from "../sharedAudio/workerLauncher.js"; 
import {getDefaultPatch} from "../sharedAudio/defaults.js";
import {fetchWaveByName} from "../sharedGui/waves.js";


//web audio api objects
let audioContext = null;



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Input monitoring to check samplerate is correctly implemented 
//and not being faked by the drivers/browser/OS
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


export function startListening(){
    createInputChain();
    startFFT(audioContext, analyserNode, "inputFFTCanvas");
}

export function setupPlayer(){
}

export function stopListening(){
    if (source){
        source.disconnect(analyserNode);
        source = null;
    }
}

const requestedSampleRate = 96000;
function ensureAudioContext(){
    if (!audioContext){
        //Will throw a warning in some browsers if not triggered by a user action
        //On page start up this is called anyway to get the playback samplerate to use for buffer generation
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate:requestedSampleRate}); 
        console.log('Sample rate: ' + audioContext.sampleRate + 'Hz')

    }    
    if (!audioContext) {
        console.error("Failed to create AudioWorkletNode");
    }
}


const fftSize = 4096*8;
let analyserNode = null;
let source = null;
function createInputChain(){
    ensureAudioContext();
    if (!audioContext) return;
    if (source) return;

    analyserNode = audioContext.createAnalyser();//blackman window with default smoothing 0.8
    analyserNode.fftSize = fftSize;
    analyserNode.smoothingTimeConstant = 0.0;
    analyserNode.minDecibels = -120;
    analyserNode.maxDecibels = 0;
    //https://stackoverflow.com/questions/71978189/lag-when-playing-mic-audio-directly-to-output-using-web-audio-api
    //https://w3c.github.io/mediacapture-main/#media-track-supported-constraints
    const constraints = { audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false
    } };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyserNode);  
      })
        .catch((error) => {
            console.error('Error accessing Input device:', error);
        });
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Connect mushra and the WavePlayer
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const numberOfSliders=6;
setNumberOfSliders(numberOfSliders);

export function doInitMushra(){
    initMushra();
}


export function doStartMushra() {
    ensureAudioContext();
    startMushra();
    
    setSampledWave(sampleName, ()=>{//load the sample then builld the buffers
        calculateMushraBuffer(getPatches(), audioContext.sampleRate, false  );
    }); 
}

setMushraBufferCallback((buffers)=>{
    startAudio(audioContext.sampleRate, buffers, getLabels());
    //buffers are now gone to worklet, do not access again!
})



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Setup the patches and generate the buffers for the mushra test
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


let sampleName = "piano";


function getLabels(){
    return [
        "A",
        ...lastInterpolations.map((x)=>x.toFixed(2)), 
        "B",
        "Anchor"];
    }


function getCorePatch(){
    let patch = { ...getDefaultPatch()}
    patch.sampleMix =1;
    return patch;
}




function setSampledWave(name, callback){
    let loadingCallback = (wave)=>{
        if (wave){
            setAudioEngineSampleBuffers(wave);
            callback();
        }
    };
    if (!name || name=="" || name==null){
        loadingCallback(null);
        return;
    }
    fetchWaveByName(audioContext.sampleRate, name, loadingCallback);
}


    
let lastInterpolations = [];
function getPatches(){
    const patches = new Array(numberOfSliders);
    let defaultP = getCorePatch();
    patches[0]=[
        {...defaultP},
        {...defaultP}
    ];
    patches[1]=[
        {...defaultP},
        {...defaultP}
    ];
    patches[2]=[
        {...defaultP},
        {...defaultP}
    ];
    patches[3]=[
        {...defaultP},
        {...defaultP}
    ];
    patches[4]=[
        {...defaultP},
        {...defaultP}
    ];
    patches[5]=[
        {...defaultP},
        {...defaultP}
    ];

    return patches;
}