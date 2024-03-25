import { startFFT, fftFill, stopFFT } from "./painting.js";
import {initMushra, setNumberOfSliders, startMushra, startAudio, getAnalyserNode, shutDownMushra } from "../sharedGui/mushra.js"; 
import {initWorkers, setMushraBufferCallback, calculateMushraBuffer, setAudioEngineSampleBuffers} from "./workerLauncher.js"; 
import {getDefaultPatch} from "../sharedAudio/defaults.js";
import {fetchWaveByName} from "../sharedGui/waves.js";


//web audio api objects
let audioContext = null;


export function getTrueSampleRate(){
    return audioContext ? audioContext.sampleRate: requestedSampleRate;
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Input monitoring to check samplerate is correctly implemented 
//and not being faked by the drivers/browser/OS
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

fftFill("inputFFTCanvas");
export function startListening(){
    createInputChain();
    startFFT(audioContext, listenInAnalyserNode, "inputFFTCanvas");
    startFFT(audioContext, listenOutAnalyserNode, "outputFFTCanvas");
}


export function stopListening(){
    if (source){
        source.disconnect(listenInAnalyserNode);
        chuffNode.disconnect(listenOutAnalyserNode);
        listenOutAnalyserNode.disconnect(audioContext.destination);

        source = null;
        chuffNode.stop();
        chuffNode =null;
        listenInAnalyserNode =null;
        listenOutAnalyserNode =null;
        stopFFT("inputFFTCanvas");
        stopFFT("outputFFTCanvas");
    }
}

const requestedSampleRate = 96000;
function ensureAudioContext(){
    if (!audioContext){
        //Will throw a warning in some browsers if not triggered by a user action
        //On page start up this is called anyway to get the playback samplerate to use for buffer generation
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate:requestedSampleRate}); 
        console.log('Sample rate: ' + audioContext.sampleRate + 'Hz')
        initWorkers(numberOfSliders);
    }    
    if (!audioContext) {
        console.error("Failed to create AudioWorkletNode");
    }
}


const fftSize = 4096*8;
let listenInAnalyserNode = null;
let listenOutAnalyserNode = null;
let source = null;
let chuffNode = null;
function createInputChain(){
    ensureAudioContext();
    if (!audioContext) return;
    if (source) return;

    listenInAnalyserNode = audioContext.createAnalyser();//blackman window with default smoothing 0.8
    listenInAnalyserNode.fftSize = fftSize;
    listenInAnalyserNode.smoothingTimeConstant = 0.0;
    listenInAnalyserNode.minDecibels = -120;
    listenInAnalyserNode.maxDecibels = 0;
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
        source.connect(listenInAnalyserNode);  
      })
        .catch((error) => {
            console.error('Error accessing Input device:', error);
        });
    


    chuffNode = audioContext.createBufferSource();    
    chuffNode.buffer=  getNoiseChuff(audioContext, audioContext.sampleRate *0.2, audioContext.sampleRate*1.8);
    chuffNode.loop = true;
    chuffNode.loopEnd = audioContext.sampleRate *2;

    listenOutAnalyserNode = audioContext.createAnalyser();//blackman window with default smoothing 0.8
    listenOutAnalyserNode.fftSize = fftSize;
    listenOutAnalyserNode.smoothingTimeConstant = 0.0;
    listenOutAnalyserNode.minDecibels = -120;
    listenOutAnalyserNode.maxDecibels = 0;


    chuffNode.connect(listenOutAnalyserNode);
    listenOutAnalyserNode.connect(audioContext.destination);
    chuffNode.start();
}


function getNoiseChuff(audioContext, playLength, silenceLength){
    let buffer = audioContext.createBuffer(1, playLength + silenceLength, audioContext.sampleRate);
    let noise = buffer.getChannelData(0);
    for (let i=0; i<playLength; i++){
        noise[i] = (Math.random()*2-1)*0.125;
    }
    return buffer;
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//SampleRate Check
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

export function checkSampleRateStatus(){
    ensureAudioContext();
    if (!audioContext) return "Error: No Audio Context";
    let tempAudioContext = new (window.AudioContext || window.webkitAudioContext)(); //Default sample rate
    let sampleRate = tempAudioContext.sampleRate;
    if (sampleRate != audioContext.sampleRate){
        return "<p class ='warning_text'>Possible Problem: Default sample rate  is not " + requestedSampleRate + "Hz</p>" +
        "<p>Please use the sample rate checker below to check that your interface is correctly set to 96kHz.</p>"
    }   
    return "<p>Sample rate appears to be correctly set to 96kHz. You can confirm this below.</p>";
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Connect mushra and the WavePlayer
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const numberOfSliders=6;
setNumberOfSliders(numberOfSliders);

export function doInitMushra(){
    initMushra();
}


export function doShutDownMushra(){
    stopFFT("outputFFTCanvas");
    shutDownMushra();
}

export function doStartMushra(waveName,cachedPatch) {
    ensureAudioContext();
    startMushra();
    
    setSampledWave(waveName, audioContext.sampleRate, (sampleTime)=>{//load the sample then builld the buffers
        let patches = getPatches(sampleTime, cachedPatch);
        returnedBuffers =new Array(numberOfSliders).fill(null);
        returnedIds =new Array(numberOfSliders).fill(0);
        lastId++;
        for (let i=0; i<numberOfSliders; i++){
            calculateMushraBuffer(i, patches[i], audioContext.sampleRate, false, lastId  );
        }
    }); 
}


let lastId = 1;
let returnedBuffers =[];
let returnedIds =[];
setMushraBufferCallback(async (index, buffers, id)=>{
    //Wait for all buffers to return before starting the audio
    returnedIds[index] = id;
    returnedBuffers[index] = buffers[buffers.length-1];//Take the last one, the first may be a dummy reference for when high pass filtering is used

    if (returnedBuffers.every((x)=>x!=null) && returnedIds.every((x)=>x==lastId)){
        await startAudio(audioContext.sampleRate, returnedBuffers, getLabels(), "outputFFTCanvas");
        startFFT(audioContext, getAnalyserNode(), "outputFFTCanvas");
    };
})



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Setup the patches and generate the buffers for the mushra test
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++




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




function setSampledWave(name,sampleRate, callback){
    let loadingCallback = (wave)=>{
        if (wave){
            let sampleTime = wave[0].length/sampleRate;
            setAudioEngineSampleBuffers(wave);//NEVER USE WAVE AGAIN, BUFFER HAS GONE TO Worker
            callback(sampleTime);//return the duration of the sample
        }
    };
    if (!name || name=="" || name==null){
        loadingCallback(null);
        return;
    }
    fetchWaveByName(audioContext.sampleRate, name, loadingCallback);
}


    
let lastInterpolations = [];
//returns a list of patches where each item in the list is either one or two pairs of patches
//When there is no high pass filtering needed, there is only one patch
function getPatches(sampleTime, cachedPatch){
    const patches = new Array(numberOfSliders);
    let defaultP = getCorePatch();
    defaultP.sampleMix = 1;//play sample only
    //Adjust the envelope of added tones/noise to be close to the sample length with suitable attack and decay times
    defaultP.attack=Math.min(sampleTime*0.1, 0.5);
    defaultP.decay = Math.min(sampleTime*0.2, 1);
    defaultP.hold = (sampleTime - defaultP.attack - defaultP.decay) *0.98 ;

    //reference
    patches[0]=[[ {...defaultP}, null]];
    
    //one tone
    let p1 ={...defaultP};
    p1.inharmonicAFrequency = cachedPatch.inharmonicAFrequency;
    p1.inharmonicALevel = cachedPatch.inharmonicALevel;
    patches[1]=[[p1 , null]];

    //two tone
    let p2 ={...defaultP};
    p2.inharmonicDFrequency = cachedPatch.inharmonicDFrequency;
    p2.inharmonicDLevel = cachedPatch.inharmonicDLevel;
    p2.inharmonicEFrequency = cachedPatch.inharmonicEFrequency;
    p2.inharmonicELevel = cachedPatch.inharmonicELevel;
    patches[2]=[[p2 , null]];

    //Noise
    let p3 ={...defaultP};
    p3.ultraSonicReferenceLevel = 1;
    p3.ultraSonicCutlevel = 0.1;
    p3.ultraSonicCutOff = cachedPatch.ultraSonicCutOff;
    p3.inharmonicNoiseLevel = cachedPatch.inharmonicNoiseLevel;
    p3.inharmonicNoiseColour = cachedPatch.inharmonicNoiseColour;
    patches[3]=[[ {...defaultP}, null],[p3 , null]];

    //Distortion
    let p4 ={...defaultP};
    p4.ultraSonicReferenceLevel = 1;
    p4.ultraSonicCutlevel = 10;
    p4.ultraSonicCutOff = cachedPatch.ultraSonicCutOff;
    p4.tanhDistortion = cachedPatch.tanhDistortion;
    p4.distortion =1;
    p4.oversampleTimes =0;
    patches[4]=[[ {...defaultP}, null],[p4 , null]];


    //Anchor
    let p5 ={...defaultP};
    p5.badFilter=true;
    //p5.digitalBitDepth=10;
    patches[5]=[[p5 , null]];


    return patches;
}