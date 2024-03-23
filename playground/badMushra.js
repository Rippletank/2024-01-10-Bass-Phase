import {initMushra, setNumberOfSliders, startMushra, startAudio } from "../sharedGui/mushra.js"; 
import {setMushraBufferCallback, calculateMushraBuffer} from "../sharedAudio/workerLauncher.js"; 


const numberOfSliders=6;
setNumberOfSliders(numberOfSliders);

export function doInitMushra(){
    initMushra();
}

export function doStartMushra(patches,subjectList, sampleRate, isNormToLoudest) {
    startMushra();
    
    const patchList = [[patches[0],patches[1]], [patches[2],patches[3]]]
    calculateMushraBuffer(getInterpolatedPatches(patchList, subjectList), sampleRate, isNormToLoudest);
}

setMushraBufferCallback((buffers)=>{
    startAudio(buffers, getLabels());
    //buffers are now gone to worklet, do not access again
})


function getLabels(){
    return [
        "A",
        ...lastInterpolations.map((x)=>x.toFixed(2)), 
        "B",
        "Anchor"];
    }


let lastInterpolations = [];
function getInterpolatedPatches(patchList, subjectList){
    const patches = new Array(numberOfSliders);
    patches[0]=patchList[0];
    patches[numberOfSliders-2]=patchList[1];

    let interpolations =[];
    let intersCount = numberOfSliders-3;
    let intersStep = 1/(1+intersCount);
    for(let i=1; i<=intersCount; i++){
        interpolations.push(intersStep*i);
    }

    interpolations.forEach((x, pos)=>{
        let newPair = [];
        for(let i=0; i<2; i++){
            let A = patchList[0][i]? {...patchList[0][i]} : null;
            let B = patchList[1][i]? {...patchList[1][i]} : null;
            if (A==null || B==null) {
                newPair.push(null);
                continue;
            }
    
            subjectList.forEach((subject)=>{
                A[subject] = A[subject]*(1-x)+B[subject]*x;
            });
            newPair.push(A);
        }
        patches[pos+1] = newPair;
    });
    lastInterpolations = interpolations;

    //Work out the anchor patch - should be bad sounding - but filter alone is often not enough
    let activePatches = patchList.reduce((acc, val)=>{   
                                acc.push(val[0]);
                                if (val[1]) acc.push(val[1]);
                                return acc;
                                },[]);
    let hasBitDepth = activePatches.some((patch)=>patch.digitalBitDepth<25);
    let hasNoise = activePatches.some((patch)=>patch.inharmonicNoiseLevel>-91);
    let BadL = {...patchList[1][0]};    
    BadL.badFilter=true;
    if (!hasBitDepth) BadL.digitalBitDepth=10; 
    if (hasBitDepth && !hasNoise) BadL.inharmonicNoiseLevel=-50;                         
    
    let BadR = null;
    if (patchList[0][1]){
        BadR = {...patchList[1][1]};
        BadR.badFilter=true;
        if (!hasBitDepth) BadR.digitalBitDepth=10; 
        if (hasBitDepth && !hasNoise) BadR.inharmonicNoiseLevel=-50;  
    }
    patches[numberOfSliders-1] = [BadL, BadR];
    return patches;
}