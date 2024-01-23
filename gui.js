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
//GUI wiring up Code - handles creation of the patch objects and value display on GUI
//Calls play and refresh methods inside audioAPI.js
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Buttons with specific actions
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

document.getElementById('playSoundA').addEventListener('click', function() {
    play(0);
});
document.getElementById('playSoundB').addEventListener('click', function() {
    play(1);
});
document.getElementById('playSoundNull').addEventListener('click', function() {
    play(2);
});
document.getElementById('fftPlayA').addEventListener('click', function() {
    play(0);
});
document.getElementById('fftPlayB').addEventListener('click', function() {
    play(1);
});
document.getElementById('fftPlayN').addEventListener('click', function() {
    play(2);
});
document.getElementById('hideFFT').addEventListener('click', function() {
    useFFT = !useFFT;
    if (!useFFT) fftClear();
    this.textContent = useFFT ? "Hide FFT" : "Show FFT";
});

function play(index){
    playAudio(index, cachedPatchA, cachedPatchB);   
}

window.addEventListener('resize', updateCanvas);

function updateCanvas() {
    let canvasA = document.getElementById('waveformA');
    let canvasB = document.getElementById('waveformB');
    let canvasN = document.getElementById('waveformNull');

    canvasA.width = canvasA.offsetWidth;
    canvasB.width = canvasB.offsetWidth;
    canvasN.width = canvasN.offsetWidth;
    updateDisplay();
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Buttons with specific actions
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++




function initSliders(){
    //Call once only at startup
    wireUpSlidersForContainer('CommonSettings');
    wireUpSlidersForContainer('TestSetup');
    wireUpSlidersForContainer('SoundASetup');
    wireUpSlidersForContainer('SoundBSetup');
    setupPresetButtons();
    
    loadPreset(getDefaultPatch(),  getDefaultAPatch(), getDefaultBPatch());


    //Check at regular intervals if any sliders have changed and update display if so
    //Add time delay to batch up changes
    setInterval(function() {
        if (changed && Date.now() - lastUpdate > 500) {
            updateBuffersAndDisplay(cachedPatchA, cachedPatchB);
        }
    }, 200); 
}

let lastUpdate=0;
function wireUpSlidersForContainer(id) {
    var element = document.getElementById(id);
    var sliderContainers = element.querySelectorAll('.slider-container');
    sliderContainers.forEach(function(sliderContainer) {
        var rangedInputs = sliderContainer.querySelectorAll('input[type="range"]');
        rangedInputs.forEach(function(rangedInput) {
            rangedInput.addEventListener('input', function() {
                updateAllLabelsAndCachePatches();
                changed=true;
                lastUpdate = Date.now();
            });
        });
    });
}

function loadSliderValuesFromContainer(id, patch) {
    var element = document.getElementById(id);
    var sliderContainers = element.querySelectorAll('.slider-container');
    sliderContainers.forEach(function(sliderContainer) {
        var rangedInputs = sliderContainer.querySelectorAll('input[type="range"]');
        rangedInputs.forEach(function(rangedInput) {
            var name = rangedInput.name;
            var value = parseFloat(rangedInput.value);
            patch[name] = value;
        });
    });
}

function setupPresetButtons(){    
    insertPresetButtons('wavePresetButtons', wavePresets);
    insertPresetButtons('envelopPresetButtons', envelopePresets);
}

function insertPresetButtons(id, presetList){     
    var buttonContainer = document.getElementById(id);
    presetList.forEach(function(preset) {
        var button = document.createElement('button');
        button.textContent = preset.name;
        button.addEventListener('click', function() {
            loadPreset(preset.patch);
        });
        buttonContainer.appendChild(button);
    });
}

function loadPreset(patch, patchA, patchB) {
    loadPatchIntoContainer('CommonSettings', patch);
    loadPatchIntoContainer('TestSetup', patch);
    loadPatchIntoContainer('SoundASetup', patchA ?? patch);
    loadPatchIntoContainer('SoundBSetup', patchB ??patch);
    updateAllLabelsAndCachePatches();
    updateBuffersAndDisplay(cachedPatchA, cachedPatchB);
}


function loadPatchIntoContainer(id, patch) {
    var element = document.getElementById(id);
    var sliderContainers = element.querySelectorAll('.slider-container');
    sliderContainers.forEach(function(sliderContainer) {
        var rangedInputs = sliderContainer.querySelectorAll('input[type="range"]');
        rangedInputs.forEach(function(rangedInput) {
            var name = rangedInput.name;
            rangedInput.value = patch[name] ?? rangedInput.value;
        });
    });
    updateAllLabelsAndCachePatches();
}

let cachedPatchA = null;
let cachedPatchB = null;
function updateAllLabelsAndCachePatches(){
    let patch = {};
    loadSliderValuesFromContainer('CommonSettings', patch);
    loadSliderValuesFromContainer('TestSetup', patch);
    updateLabelsFor('CommonSettings', patch);
    updateLabelsFor('TestSetup', patch);

    loadSliderValuesFromContainer('SoundASetup', patch);
    cachedPatchA = {...patch};
    updateLabelsFor('SoundASetup', patch);

    loadSliderValuesFromContainer('SoundBSetup', patch);
    cachedPatchB = {...patch};
    updateLabelsFor('SoundBSetup', patch);
}



function updateLabelsFor(containerId, patch) {
    var element = document.getElementById(containerId);
    var valueElements = element.querySelectorAll('.valueSpan');
    valueElements.forEach(function(ve) {
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

                
            case "attack": ve.textContent = patch.attack + "s";break;  
            case "decay": ve.textContent = patch.decay + "s";break;
            case "hold": ve.textContent = patch.hold + "s";break;
            case "envelopeFilter": 
                ve.textContent = patch.envelopeFilter=="1"? "off" : patch.envelopeFilter.toFixed(0);
                break;

            case "rootPhaseDelay": 
                ve.innerHTML =getPhaseLabel(patch);break;
        }
    });
}

function toPercent(value){
    return (value*100).toFixed(0) + "%";
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




//Initialise display of waveform and audio buffers on first load
initSliders();




//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//ABX TEST GUI Code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


let abxTestChoice;
let abxCount =0;
let abxScore =0;
function playABX(){    
    if (abxTestChoice === 0) {
        play(0);
    } else {
        play(1);
    }
}

document.getElementById('abxTest').addEventListener('click', function() {
    abxTestChoice = Math.round(Math.random());
    document.getElementById('abxButtons').style.display = 'flex';
    document.getElementById('abxTest').style.display = 'none';
    document.getElementById('resetTest').style.display = 'block';
    playABX();
});

document.getElementById('play').addEventListener('click', function() {
    playABX();
});

document.getElementById('buttonA').addEventListener('click', function() {
    checkChoice(0);
});

document.getElementById('buttonB').addEventListener('click', function() {
    checkChoice(1);
});

document.getElementById('resetTest').addEventListener('click', function() {
    let results = document.getElementById('results');
    results.innerHTML = '';
    abxCount =0;
    abxScore =0;
    document.getElementById('abxButtons').style.display = 'none';
    document.getElementById('abxTest').style.display = 'block';
    document.getElementById('resetTest').style.display = 'none';
    const stats = document.getElementById('stats');
    stats.textContent = '';
});

function checkChoice(choice) {
    const results = document.getElementById('results');
    const result = document.createElement('li');

    abxCount++;
    if (choice === abxTestChoice) {
        abxScore++;
        result.textContent = 'Correct! The answer was ' + (abxTestChoice === 0 ? 'A' : 'B') + '.';
    } else {
        result.textContent = 'Incorrect. The correct answer was ' + (abxTestChoice === 0 ? 'A' : 'B') + '.';
    }

    results.appendChild(result);
    document.getElementById('abxButtons').style.display = 'none';
    document.getElementById('abxTest').style.display = 'block';
    
    const stats = document.getElementById('stats');
    stats.textContent = 'Score: ' + abxScore + '/' + abxCount +'  ' + Math.round(abxScore / abxCount * 100).toFixed(0) + '%' ;
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Help pop up trigger code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let helpIcons = document.querySelectorAll('.help-icon');

helpIcons.forEach(function(helpIcon) {
    helpIcon.addEventListener('click', function(event) {
        event.stopPropagation();
        clearHelp();
        let helpPopup = this.nextElementSibling;
        helpPopup.style.display = 'block';
    });
});

document.addEventListener('click', function() {
    clearHelp();
});

function clearHelp(){
    let helpPopups = document.querySelectorAll('.help-popup');
    helpPopups.forEach(function(helpPopup) {
        helpPopup.style.display = 'none';
    });
}
