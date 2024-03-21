//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Part of audio engine - but on mainThread - fetches and opens wave files for alternative sounds
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

//Duplicated with GUI, but this is the audio engine worker side - allow browser to handle duplication via caching?
let serverWaveList = [];
let waveListPromise = fetch('./waveList.json')
    .then(response => response.json())
    .then(list => {
        if (!Array.isArray(list)) throw new Error('Wave List is not an array');
        let newList = [];
        list.forEach(fileName => {
            if (fileName) {
                newList.push(fileName);
            }})
        serverWaveList = newList;
        return serverWaveList;})
    .catch((error) => {
        console.error('Error fetching Wave List:', error);
    });

export function fetchWaveListAsync() {
    return waveListPromise;
}


//MUST be give the audioConext from the main thread so it can produce the correct sample rate etc
//CAN'T work on workerThread because audioConext is not available there
let audioContext = null;
export function setAudioContext(context){
    audioContext = context;
}


let waveArray = {};

function checkIdsAreValid(ids){    
    return ids.reduce((p,id)=>p && id >= 0 && id < serverWaveList.length , true);
}

function checkHasAllWavesById(ids){    
    return ids.reduce((p,id)=>p && id >= 0 && id < serverWaveList.length &&  waveArray[serverWaveList[id]], true);
}

function checkHasAllWavesByName(namesList){    
    return namesList.reduce((p,name)=>p && waveArray[name], true);
}

function getWaveOrNull(id){
    if (id < 0 || id >= serverWaveList.length) return null;
    let name = serverWaveList[id];
    if (waveArray[name]){
        return waveArray[name];
    }
    else{
        return null;
    }
}

function getWaveOrNullByName(name){
    if (waveArray[name]){
        //clone the wave ready to push to audio Worker thread
        let returnArray = [];
        waveArray[name].forEach(channel => {
            returnArray.push(new Float32Array(channel));
        });
        return returnArray;
    }
    else{
        return null;
    }
}


//Considered async, but this method allows parallel loading of waves, so could be potentially faster
export function fetchWaves(ids, callback){
    if (!checkIdsAreValid(ids)){
        console.error("Invalid wave ids in list: ",ids);
        throw new Error("Invalid wave ids in list");
    }
    if (checkHasAllWavesById(ids)){
        callback();
        return;
    }

    let names = ids.map(id => serverWaveList[id]);    
    fetchWavesByName(names, callback)
}

export function fetchWavesByName(names, callback){
    const audioContext = new OfflineAudioContext();

    const checkOnDone = () => {
        if (checkHasAllWavesByName(names)){
            callback();
        }
    }

    for(let i=0; i<names.length; i++){
        // Fetch the audio file
        let name = names[i];
        if (!waveArray[name]){
            fetch('../waves/' + name + '.wav')
                .then(response => response.arrayBuffer())
                .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
                .then(audioBuffer => {
                    // The audioBuffer variable now contains the decoded audio data
                    let data = [];
                    for (let i = 0; i < audioBuffer.numberOfChannels; i++){
                        data.push(audioBuffer.getChannelData(i));
                    }
                    waveArray[name] = data;
                    console.log("audioBuffer for " + name + " loaded.");
                    checkOnDone();
                })
                .catch(e => {
                    console.error('Error fetching or decoding audio file: '+name, e);
                    waveArray[name] = null;//register null to prevent repeated attempts
                    checkOnDone();
                });            
        }
    }
}

//Callback takes two variables, the buffer and a flag saying if it was fetched or not (ie it was already in memory)
//Tells the callback if it has been delayed or if it is instant
export function fetchWaveByName(name, callback){
    if (!name || name=="" || name=="null"){
        callback(null, false);
        return;
    }
    if (checkHasAllWavesByName([name])){
        callback(getWaveOrNullByName(name), false);
        return;
    }
    if (!waveArray[name]){
        fetch('./waves/' + name + '.wav')
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                // The audioBuffer variable now contains the decoded audio data
                let data = [];
                for (let i = 0; i < audioBuffer.numberOfChannels; i++){
                    data.push(audioBuffer.getChannelData(i));
                }
                waveArray[name] = data;
                console.log("audioBuffer for " + name + " loaded.");
                callback(getWaveOrNullByName(name), true);
            })
            .catch(e => {
                console.error('Error fetching or decoding audio file: '+name, e);
                callback(null);
            });            
    }
}
