//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Launch webworkers to handle separate threads for calls to the audio.js functions
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


export function initWorkers(count){
    if (audioBufferWorker.length===count) return;
    if (audioBufferWorker.length>0) audioBufferWorker.forEach((worker)=>worker.terminate());
    let newWorkers = [];
    for (let i=0; i<count; i++){
        let worker = new Worker('../sharedAudio/audioWorker.js', { type: 'module' });
        worker.onmessage = function(event) {
            audioBufferWorkerBusy[i] = false;
            const { data } = event;
            if (data.error) {
              console.error(`There was an error calling the Audio Buffer function ${i}: ${data.error}`);
            } else
            if (data.type=="Mushra") {
                mushraBufferCallback(i, data.buffers, data.id);
            }
            checkForCachedAudioBuffer(i);
          }; 
          worker.onerror = function(error) {
            audioBufferWorkerBusy[i] = false;
            console.error(`An error occurred in the Audio Buffer worker ${i}: ${error.message}`);
            checkForCachedAudioBuffer(i);
          }
          newWorkers.push(worker);
    }
    audioBufferWorker = newWorkers;
    audioBufferWorkerBusy = new Array(count).fill(false);
    mushraBufferCached = new Array(count).fill(null);
}

let audioBufferWorker = [];
let audioBufferWorkerBusy =[];
let mushraBufferCallback = (index, buffers, id)=>{};
let mushraBufferCached = [];

export function setMushraBufferCallback( callback ) {
    mushraBufferCallback = callback;
}

export function calculateMushraBuffer(index, patchList, sampleRate, isNormToLoudest, id ) {
    if (audioBufferWorkerBusy[index]){
        mushraBufferCached[index] = {patchList, sampleRate, isNormToLoudest, id};
        return;
    }
    mushraBufferCached[index]=null;
    audioBufferWorkerBusy[index]=true;
    audioBufferWorker[index].postMessage({
        action: 'getMushraBuffers',
        patchList:patchList,
        sampleRate:sampleRate,
        isNormToLoudest:isNormToLoudest,
        id:id
      });
}

function checkForCachedAudioBuffer(index){
   if (mushraBufferCached[index]){
        calculateMushraBuffer(index,
            mushraBufferCached[index].patchList, 
            mushraBufferCached[index].sampleRate, 
            mushraBufferCached[index].isNormToLoudest,
            mushraBufferCached[index].id);
    }
}


export function setAudioEngineSampleBuffers(buffers){
    if (!buffers || buffers.length==0) return;
    audioBufferWorker.forEach((worker)=>
        {
            let newB = [];
            buffers.forEach((buffer)=>{if(buffer) newB.push(new Float32Array(buffer))});
            let transferList = [];
            newB.forEach((buffer)=>transferList.push(buffer.buffer));
            worker.postMessage({
                action: 'setSampleBuffers',
                buffers:newB
            },
            transferList);
        });
}



