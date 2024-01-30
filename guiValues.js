//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio API link Code
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
//Knows about the meaning values in the patch and can translate them into meaningful values for the GUI
//Allows for units and non-linear scales etc
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


function setValueFromPatch(ve, patch){
    switch (ve.name) {
        case "frequency": 
            ve.textContent = patch.frequency.toFixed(0) + "Hz";
            break;
        case "higherHarmonicRelativeShift": 
            ve.textContent = toPercent(patch.higherHarmonicRelativeShift);
            break;
        case "odd": 
            ve.textContent = getPartialLevelLabel(patch.oddLevel,patch.oddAlt);
            break;
        case "even": 
            ve.textContent = getPartialLevelLabel(patch.evenLevel, patch.evenAlt);
            break;
        case "oddFalloff": 
            ve.innerHTML = toFalloffString(patch.oddFalloff);
            break;
        case "evenFalloff":
            ve.innerHTML = toFalloffString(patch.evenFalloff);
            break;
            break;
        case "altW":
            ve.innerHTML = "Every "+ toReciprocal(patch.altW) +" steps &nbsp; (Duty: " +toPercent(patch.altW)+")";
            break;
        case "altOffset":
            let isInt = Math.round(patch.altOffset) ==patch.altOffset;
            let valText = patch.altOffset.toFixed(1);
            if (isInt){
                switch(patch.altOffset){
                    case -1: valText =valText + ' step &nbsp; Even -↔+ &nbsp; Odd 0↔0';break;
                    case 0: valText =valText +  ' steps &nbsp; Even 0↔0 &nbsp; Odd +↔-';break;
                    case 1: valText = valText + ' step &nbsp; Even +↔- &nbsp; Odd 0↔0';break;
                }
            }
            else{
                valText =valText +' steps &nbsp;&nbsp; both';
            }
            ve.innerHTML = valText;
            break;
        case "sinCos":
            let type = "&nbsp;";
            if (patch.sinCos==0) type = "sin(t)";
            if (patch.sinCos==-1) type = "-cos(t)";
            if (patch.sinCos==1) type = "cos(t)";
            ve.innerHTML = (patch.sinCos*0.5).toFixed(2)+'π &nbsp;&nbsp; '+type;
            break;
        case "balance": 
            if (patch.balance==0) 
            {
                ve.textContent = "-";
            }
            else if (patch.balance==1) 
            {
                ve.textContent = "higher only";
            }
            else if (patch.balance==-1) 
            {
                ve.textContent = "1st only";
            }
            else if (patch.balance>0) 
            {
                let db = patch.balance*patch.balance*75;
                ve.textContent = "1st "+(-db).toFixed(db<3?2:1 )+"db";                    
            }
            else if (patch.balance<0) 
            {
                let db = patch.balance*patch.balance*75;
                ve.textContent = "high "+(-db).toFixed(db<3?2:1)+"db";                    
            }
            break;
            
        case "attack": ve.textContent = patch.attack + "s";break;  
        case "decay": ve.textContent = patch.decay + "s";break;
        case "hold": ve.textContent = patch.hold + "s";break;
        case "envelopeFilter": 
            if (patch.envelopeFilter==0) 
                {
                    ve.innerHTML = "<b>OFF</b>";
                }
                else
                {
                    ve.textContent = patch.envelopeFilter.toFixed(0);
                }
            break;


        case "attackF": ve.textContent = patch.attackF + "s";break;  
        case "decayF": ve.textContent = patch.decayF + "s";break;
        case "holdF": ve.textContent = patch.holdF + "s";break;
        case "filterF1": ve.textContent = toFilterFreq(patch.filterF1);break;
        case "filterF2": ve.textContent = toFilterFreq(patch.filterF2);break;
        case "filterF3": ve.textContent = toFilterFreq(patch.filterF3);break;
        case "filterSlope": 
        if (patch.filterSlope==0) 
            {
                ve.innerHTML = "<b>OFF</b>";
            }
            else
            {
                ve.textContent = patch.filterSlope.toFixed(0)+"db/oct";
            }
        break;

        case "rootPhaseDelay": 
            ve.innerHTML =getPhaseLabel(patch);break;
        
        case "distortion":
            if (patch.distortion==0)
            {
                ve.innerHTML = "<b>off</b>";
            }
            else
            {
                ve.textContent = toPercent(patch.distortion);
            }
            break;
        case "oddDistortion":
            ve.textContent =toPercent(patch.oddDistortion);break;
        case "evenDistortion":
            ve.textContent =toPercent(patch.evenDistortion);break;

    }
}


function toPercent(value){
    return (value*100).toFixed(0) + "%";
}   
function toReciprocal(value){
    if (value>0.5) return (1/value).toFixed(2);
    if (value>0.01) return (1/value).toFixed(1);
    if (value>0.001) return (1/value).toFixed(0);
    return "∞"
    
}

function toFalloffString(value){
    let result = "";
    if (value==0) result = "1";
    else if (value==1) result = "1/n";
    else result = "1/n<sup>" + value + "</sup>";
    return result;
}

function getPartialLevelLabel(level, polarity){
    level = level ;
    polarity =polarity;
    let value = "off"
    if (level!=0)
    {
        if (polarity==0) 
            value = level.toFixed(1);
        else
            value = level.toFixed(1) +"↔" + (level *(-2 * polarity +1)).toFixed(1);
    }
    return value;
}


function getPhaseLabel(patch){
    let invFreq = 1000 / (patch.frequency * 2);
    let rootPhaseDelay = patch.rootPhaseDelay;
    let delayA = rootPhaseDelay * invFreq;
    return rootPhaseDelay.toFixed(2) + "π <br> (" + (delayA).toFixed(1) + "ms)";
}

function toFilterFreq(x){
    return (20 * Math.pow(2,x)).toFixed(0) + "Hz";
}

