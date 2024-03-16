

import {setMushraBufferCallback, calculateMushraBuffer} from "./workerLauncher.js";


let audioContext = null;
let myAudioProcessor = null;


export function setupMushra(patches,subjectList, sampleRate, isNormToLoudest) {
    const patchList = [[patches[0],patches[1]], [patches[2],patches[3]]]
    calculateMushraBuffer(patchList, sampleRate, isNormToLoudest);
}



export function shutDownMushra() {
    if (audioContext) {
        audioContext.close();
        myAudioProcessor.disconnect();
        audioContext = null;
        myAudioProcessor = null;
        //cancelAnimationFrame(getfftFrameCall());
        //clearFFTFrameCall();
    }

}

setMushraBufferCallback((buffers)=>{
    startAudio(buffers) 
})


async function startAudio(buffers) {
    myAudioProcessor = await createMyAudioProcessor();
    if (!myAudioProcessor) {
        console.error("Failed to create AudioWorkletNode");
        return;
    }
    postWorkletMessage("loadSounds", {sounds:buffers});
}


async function createMyAudioProcessor() {
    if (!audioContext) {
        try {
        audioContext = new AudioContext();
        await audioContext.resume();
        await audioContext.audioWorklet.addModule("mushraWorklet.js");
        } catch (e) {
        return null;
        }
    }
    
    const node = new AudioWorkletNode(audioContext, "mushraPlayer");
    const srParam =  node.parameters.get("sampleRate");
    srParam.setValueAtTime(audioContext.sampleRate, audioContext.currentTime);
    node.port.onmessage = (event)=>{
        switch(event.data.type){
            case "hmmm":

                break;
        }
    }
    node.connect(audioContext.destination); 
    return node;
}


function postWorkletMessage(name, data){
    let payload = {type:name, data:data};
    if (myAudioProcessor) myAudioProcessor.port.postMessage(payload);
}