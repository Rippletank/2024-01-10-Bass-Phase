import { startFFT } from "./painting.js";




//web audio api objects
let audioContext = null;



export function startListening(){
    createInputChain();
    startFFT(audioContext, analyserNode, "inputFFTCanvas");
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