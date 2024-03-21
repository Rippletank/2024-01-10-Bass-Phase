export async function initPlayerWorklet(audioContext){
    await audioContext.audioWorklet.addModule("../sharedGui/wavePlayerWorklet.js");
}


export function getWavePlayer(audioContext, enableSlidersFunc, updateMaxFunc){
    const node = new AudioWorkletNode(audioContext, "wavePlayer",{
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
    
    });
    const srParam =  node.parameters.get("sampleRate");
    srParam.setValueAtTime(audioContext.sampleRate, audioContext.currentTime);
    node.port.onmessage = (event)=>{
        switch(event.data.type){
            case "SoundsOk":
                enableSlidersFunc();
                break;
            case "max":
                updateMaxFunc(event.data.data);
                break;
            default:
                console.log("Message from AudioWorklet: "+event.data.type+": "+event.data.data);
                break;
        }
    }
    return node;
}

export function doPlaySound(node, index){
    doPostPlayerMessage(node,"playSound", {index:index});
}

export function logStatus(node){
    doPostPlayerMessage(node,"report", null);
}

function doPostPlayerMessage(node, name, data){
    if (!node) return;
    let payload = {type:name, data:data};
    if (node) node.port.postMessage(payload);
}

export function doPause(node, isPaused){
    doPostPlayerMessage(node,"pause", isPaused);
}

//array of arrays of Float32Arrays, [[L1,R1],[L2,R2]] or [[M1,null],[M2,null]]
export function doLoadPlayerWave(node,buffers){
    let payload = {type:"loadSounds", data:{sounds:buffers}};
    let transferList = [];
    buffers.forEach((b)=>{
        transferList.push(b[0].buffer);
        if (b.length>1 && b[1]) transferList.push(b[1].buffer);
    });
    if (node) node.port.postMessage(payload);
}