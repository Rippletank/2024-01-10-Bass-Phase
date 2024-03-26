//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Handles specifically wiring up the GUI to the audio code 
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
//GUI wiring up Code - handles connecting the GUI to the audio code 
//Doesn't know anything about the contents of the patch, audio calculations or Web Audio API
//Patch values handled by guiValues.js
//Audio API handled by audioAPI.js (including calls to painting.js to update preview and waveform displays)
//Audio calculations handled by audio.js and distortion.js 
//Distortion fft shown using fft.js
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


import { getDefaultPatch, getDefaultAPatch, getDefaultBPatch, defaultTestSubjectList, getMiniPresets } from '../sharedAudio/defaults.js';
import { 
    fftFill, 
    getUseFFT,
    toggleUseFFT,
    getCanvasTooltips, 
    detailedFFTResetFrequencyRange, 
    detailedFFTGetMinDb, 
    detailedFFTSetMinDb 
} from './painting.js';


import {
    toLightMode
} from '../sharedGui/colors.js'

import {disableGroups, setValueFromPatch } from './guiValues.js';

import {
    playAudio,
    stop,
    updateBuffersAndDisplay, updateDisplay,

    updateAllPreviews, 
    doPaintAllPreviews,
    
    updateDetailedFFT, 
    repaintDetailedFFT,

    getCachedPatches,
    setCachedPatches,
    forceBufferRegeneration,
    forcePreviewRegeneration,
    getFlags,

    setSampledWave,

    startSuspendPreviewUpdates, endSuspendPreviewUpdates, getTrueSampleRate
} from './audioAPI.js';

import { shutDownMushraAndStopAudio, repaintMushra, setResultsStyle } from '../sharedGui/mushra.js';
import { doStartMushra, doInitMushra } from './badMushra.js';
import { fetchWaveListAsync } from '../sharedGui/waves.js';



let flags = getFlags();

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Buttons with specific actions
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const playButtons =[
    document.querySelectorAll('.PlayA'),
    document.querySelectorAll('.PlayB'),
    document.querySelectorAll('.PlayN'),
    document.querySelectorAll('.playX'),
    document.querySelectorAll('.PlayS')
]
//Play buttons
playButtons[0].forEach(el=>el.addEventListener('click', function() {
    play(0);
    colorPlayButtons(0);
}));
playButtons[1].forEach(el=>el.addEventListener('click', function() {
    play(1);
    colorPlayButtons(1);
}));
playButtons[2].forEach(el=>el.addEventListener('click', function() {
    play(2);
    colorPlayButtons(2);
}));
playButtons[4].forEach(el=>el.addEventListener('click', function() {
    stop();
}));



function play(index){
    playAudio(index);  
}

function colorPlayButtons(index){ 
    playButtons.forEach((buttons, i)=>{
        buttons.forEach((button)=>{
            if (i==index) {
                button.classList.add('selected');
            } else {
                button.classList.remove('selected');
            }
        });});

}


//load settings for all of the little green buttons
let previewButtons = document.querySelectorAll('.previewButton');
let previewSubjectChanged=false;
previewButtons.forEach(function(button) {
    switch(button.name[0]){    
        case 'e'://Expand All/Collapse All
            button.addEventListener('click', function() {
                toggleGlobalExpander();
            });
            button.isChecked =()=>false;
            break;
        case 'N'://Normalisation option 
            let state = button.name=='NormLoudest'
            button.addEventListener('click', function() {
                flags.isNormToLoudest =state;
                previewSubjectChanged = true;
                updatePreviewButtonState();
                forceBufferRegeneration();
                flags.changed = true;
            });
            button.isChecked =()=> flags.isNormToLoudest == state;
            break;  
        case 's'://Stereo 
            button.addEventListener('click', function() {
                flags.isStereo = !flags.isStereo;
                updatePreviewButtonState();
                forceBufferRegeneration();
                previewSubjectChanged = true;
                setUpStereo(flags.isStereo);
            });
            button.isChecked =()=> flags.isStereo;
            break;
        case 'P': //patch to use for preview
            let sub =0;
            let chan=0;
            switch(button.name){
                case 'PD': sub=0;chan=0;break;
                case 'PA': sub=1;chan=0;break;
                case 'PAR': sub=1;chan=1;break;
                case 'PB': sub=2;chan=0;break;
                case 'PBR': sub=2;chan=1;break;
            };
            button.addEventListener('click', function() {
                flags.previewSubject = sub;
                flags.previewSubjectChannel = chan;
                previewSubjectChanged = true;
                DoFullPreviewUpdate();
            });
            button.isChecked =()=> flags.previewSubject == sub && (!flags.isStereo || flags.previewSubjectChannel==chan);
        break;
        case 'a'://apiFFT
            if (button.name=='apiFFT') {
                button.addEventListener('click', function() {
                    let useFFT = toggleUseFFT();
                    if (!useFFT) fftFill("fftCanvas");
                    updatePreviewButtonState();
                });
                button.isChecked =()=> getUseFFT();
            }
        break;
        case 'q'://detailed FFT
            let action = null;
            let checked = null;
            if (button.name=='qDo') {
                action = ()=>updateDetailedFFT();
                checked =()=> !autoUpdateDetailedFFT;
            }
            else if (button.name=='qAuto') {
                action = ()=>
                        {
                            autoUpdateDetailedFFT = !autoUpdateDetailedFFT;
                            if (autoUpdateDetailedFFT) updateDetailedFFT();
                            updatePreviewButtonState();
                        }
                checked =()=> autoUpdateDetailedFFT;
            }
            else if (button.name[1]=='f') {
                switch(button.name[2]){
                    case '-':
                        action = ()=>
                        {
                            getCanvasTooltips().staticFFTCanvas.drag(0.5, 0,0.5);
                            repaintDetailedFFT();
                        }
                        break;
                    case '+':
                        action = ()=>
                            {   
                                getCanvasTooltips().staticFFTCanvas.drag(0.5, 0,-0.5);
                                repaintDetailedFFT();
                            }
                        break;
                    case 'R':
                        action = ()=>
                        {
                            detailedFFTResetFrequencyRange();
                            repaintDetailedFFT();
                        };
                        break;
                }
                checked =()=> false;
            }
            else if (button.name[1]=='d') {
                let target =90;
                switch(button.name[2]){
                    case '6'://60db
                        target=-150;
                        break;
                    case '9'://90db
                        target=-90;
                        break;
                    case '1'://120db
                        target=-120;
                        break;
                }
                action = ()=>
                    {
                        detailedFFTSetMinDb(target);
                        repaintDetailedFFT();
                        updatePreviewButtonState();
                    }
                checked =()=> detailedFFTGetMinDb() ==target;
            }
            button.addEventListener('click', function() {
                action();
            });
            button.isChecked =checked;
        break;
        case 'F': //filter preview options
            let subF =parseInt(button.name[1]);
            button.addEventListener('click', function() {
                flags.filterPreviewSubject = subF;
                DoFullPreviewUpdate();
            });
            button.isChecked =()=> flags.filterPreviewSubject == subF;
        break;
        case 'H'://Harmonics preview view options
            let fh = ()=>{};//function to call when clicked
            let ch = ()=>false;//isChecked function
            switch(button.name){
                case 'HFull': 
                    fh=()=>flags.previewSpectrumFullWidth=!flags.previewSpectrumFullWidth;
                    ch=()=>flags.previewSpectrumFullWidth;
                    break;
                case 'HPhase': 
                    fh=()=>flags.previewSpectrumShowPhase=!flags.previewSpectrumShowPhase;
                    ch=()=>flags.previewSpectrumShowPhase;
                    break;
                case 'HPolarity': 
                    fh=()=>flags.previewSpectrumPolarity=!flags.previewSpectrumPolarity;
                    ch=()=>flags.previewSpectrumPolarity;
                    break;
            }
            button.addEventListener('click', function() {
                fh();
                updatePreviewButtonState();
                doPaintAllPreviews();
            });
            button.isChecked =ch;
        break;
        case 'x'://Harmonics preview view options
            let xa = ()=>{};//function to call when clicked
            let xc = ()=>false;//isChecked function
            switch(button.name){
                case 'xSave': 
                    xa=()=>saveFullPatchToFile();
                    break;
                case 'xLoad': 
                    xa=()=>loadFullPatchFromFile();
                    break;
                case 'xCopy': 
                    xa=()=>saveFullPatchToClipboard();
                    break;
                case 'xPaste': 
                    xa=()=>loadFullPatchFromClipboard();
                    break;
            }
            button.addEventListener('click', function() {
                xa();
            });
            button.isChecked =xc;
        break;
        case 'D'://Harmonics preview view options
            let fd = ()=>{};//function to call when clicked
            let cd = ()=>false;//isChecked function
            switch(button.name){
                case 'DFull': 
                    fd=()=>flags.distortionSpectrumFullWidth=!flags.distortionSpectrumFullWidth;
                    cd=()=>flags.distortionSpectrumFullWidth;
                    break;
                case 'DPhase': 
                    fd=()=>flags.distortionSpectrumShowPhase=!flags.distortionSpectrumShowPhase;
                    cd=()=>flags.distortionSpectrumShowPhase;
                    break;
                case 'DPolarity': 
                    fd=()=>flags.distortionSpectrumPolarity=!flags.distortionSpectrumPolarity;
                    cd=()=>flags.distortionSpectrumPolarity;
                    break;
            }
            button.addEventListener('click', function() {
                fd();
                updatePreviewButtonState();
                doPaintAllPreviews();
            });
            button.isChecked =cd;
        break;
        case 'w': //Waveform A/B options
            let fw = ()=>{};//function to call when clicked
            let cw = ()=>false;//isChecked function
            switch(button.name){
                case 'wShowF': 
                    fw=()=>flags.showBufferFilterOverlay=!flags.showBufferFilterOverlay;
                    cw=()=>flags.showBufferFilterOverlay;
                    break;
                case 'wShowEG': 
                    fw=()=>flags.showBufferEnvelopeOverlay=!flags.showBufferEnvelopeOverlay;
                    cw=()=>flags.showBufferEnvelopeOverlay;
                break;
            }
            button.addEventListener('click', function() {
                fw();
                updatePreviewButtonState();
                updateDisplay();
            });
            button.isChecked =cw;
        break;
        case 't'://theme switch
            button.addEventListener('click', function() {
                let body = document.body;
                let isDarMode = toLightMode(body, body.getAttribute('data-theme') === 'dark');
                fftFill('fftCanvas');
                setModeText(this, isDarMode);
                updateDisplay();
                repaintDetailedFFT();
            });
            button.isChecked =()=>false;
            break;
        case 'z'://reset
            button.addEventListener('click', function() {
                loadPatches(getDefaultPatch(),  getDefaultAPatch(), getDefaultBPatch(), null, null, []);
            });
            button.isChecked =()=>false;
            break;

    }
});

function DoFullPreviewUpdate(){
    updatePreviewButtonState();
    forcePreviewRegeneration();
    updateAllPreviews();
}




function updatePreviewButtonState(){
    previewButtons.forEach((button)=>{
        const checked = button.isChecked();
        button.classList.add(checked ? 'button-selected' : 'button-unselected');
        button.classList.remove(checked ? 'button-unselected' : 'button-selected');
    });
}


//Canvas resize handler
let canvases = document.querySelectorAll('canvas');
window.addEventListener('resize', updateCanvas);
function updateCanvas() {
    adjustViewport();
    canvases.forEach((canvas)=>{
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    });
    updateDisplay();
    doPaintAllPreviews();
    repaintDetailedFFT();
    repaintMushra();
}

function adjustViewport() {
    var viewportMeta = document.getElementById('viewport-meta');
    var isMobile = window.matchMedia('(max-width: 600px)').matches;
    
    if (isMobile) {
        viewportMeta.setAttribute('content', 'width=600, initial-scale=1'); //basically stop it zooming in on mobile
    } else {
        viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0');
    }
}

document.addEventListener('DOMContentLoaded', updateCanvas);


updateCanvas();

const pinSVG = '<svg width="100%" height="100%" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:1.5;">'
                +'<g transform="matrix(1.13128,0.691335,-0.633265,1.03625,7.5859,-7.16049)">'
                +'<path d="M13.82,5.101L13.841,5.101L13.841,11.217L13.82,11.217L15.28,12.042L11.196,12.042L11.196,20.444L9.947,23.005L8.698,20.444L8.698,12.042L4.614,12.042L6.074,11.217L6.053,11.217L6.053,5.101L6.074,5.101L4.614,4.275L15.28,4.275L13.82,5.101Z" fill="#AAAAAA"/>'
                +'</g></svg>';


//Allow pinning of certain sections eg detailed FFT
document.querySelectorAll('.pin').forEach((pin) => {
    pin.addEventListener('click', function() {
    let stickyElement = this.closest('.canBeSticky');
    if (stickyElement){
        stickyElement.classList.toggle('stickyBottom');
    }
    else{        
        stickyElement = this.closest('.canBeStickyTop');
        if (stickyElement){
            stickyElement.classList.toggle('stickyTop');
        }
    }
    adjustStickySpacing();
  });
  pin.innerHTML = pinSVG;
});

function adjustStickySpacing(){
    let stickyElements = 
        [
            ...document.querySelectorAll('.stickyTop'),
            ...document.querySelectorAll('.stickyBottom')
        ];
    let top=0;
    for(let i=0;i<stickyElements.length;i++){
        let stickyElement = stickyElements[i];
        stickyElement.style.top = top + 'px';
        top += stickyElement.clientHeight+5;
    }
    let bottom=0;
    for(let i=stickyElements.length-1;i>=0;i--){
        let stickyElement = stickyElements[i];
        stickyElement.style.bottom = bottom + 'px';
        bottom += stickyElement.clientHeight+5;
    }
}

  function setModeText(button, isDarMode){
    button.textContent = isDarMode? 'Light Mode' :'Dark Mode';
  }

setModeText(document.getElementById('theme-switch'), document.body.getAttribute('data-theme') === 'dark');

fftFill("fftCanvas");

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Generally methods for sliders and preset buttons
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++








//Ids of div sections that contain sliders and should be checked and loaded
const commonSectionNames = [
    'CommonSettings', 
    'FilterSetup', 
    'TestSetup', 
    'SampleSetup',
    'DistortionSetup',
    'DigitalSetup',
    'naughtyFilter'
];


let autoUpdateDetailedFFT = true;
function initSliders(){
    //Call once only at startup
    commonSectionNames.forEach((sectionName)=>{
        wireUpSlidersForContainer(sectionName);
    });
    wireUpSlidersForContainer('SoundASetup');
    wireUpSlidersForContainer('SoundBSetup');
    setupPresetButtons();
    updatePreviewButtonState();
    
    loadPatches(getDefaultPatch(),  getDefaultAPatch(), getDefaultBPatch(), null, null, defaultTestSubjectList);

    //Check at regular intervals if any sliders have changed and update display if so
    //Add time delay to batch up changes
    setInterval(function() {
        if (!isMouseDown && Date.now() - lastUpdate > 200) {
            if (flags.changed){
                updateBuffersAndDisplay();
                if (autoUpdateDetailedFFT) updateDetailedFFT();
                previewSubjectChanged=false;
            }
            else if (previewSubjectChanged && autoUpdateDetailedFFT){
                previewSubjectChanged=false;
                updateDetailedFFT();//Respond to changes of previewSubject (and isStereo)
            }
        }
    }, 200); 

    setTimeout(function() {
        if (autoUpdateDetailedFFT) updateDetailedFFT();
    },500);
}


//Detect Mouse down status - allow full update skips when mouse is down
let isMouseDown = false;
window.addEventListener('mousedown', function() {
    isMouseDown = true;
});
window.addEventListener('mouseup', function() {
    isMouseDown = false;
});


let lastUpdate=0;
function wireUpSlidersForContainer(id) {
    var element = document.getElementById(id);
    var sliderContainers = element.querySelectorAll('.slider-container');
    sliderContainers.forEach(function(sliderContainer) {
        setupNewSliderContainer(sliderContainer);
    });
}
function setupNewSliderContainer(sliderContainer) {
    var rangedInputs = sliderContainer.querySelectorAll('input[type="range"]');
    rangedInputs.forEach(function(rangedInput) {
        rangedInput.addEventListener('input', function() {
            handleValueChange();
        });
        rangedInput.addEventListener('dblclick', function() {
            let defaultValue = getDefaultPatch()[rangedInput.name] ?? rangedInput.value;  
            rangedInput.value = defaultValue;
            handleValueChange();
        })
    });
}
function handleValueChange() {
    updateAllLabelsAndCachePatches();
    flags.changed = true;
    lastUpdate = Date.now();
    updateAllPreviews();
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

let miniPresets = getMiniPresets();
function setupPresetButtons(){    
    insertPresetButtons('wavePresetButtons', miniPresets.wavePresets);
    insertPresetButtons('envelopPresetButtons', miniPresets.envelopePresets);
    insertPresetButtons('speakerPresets', miniPresets.speakerPresets);
    insertPresetButtons('filterPresetButtons', miniPresets.filterPresets);
    insertPresetButtons('distortionPresets', miniPresets.distortionPresets);
    insertPresetButtons('oversamplingPresets', miniPresets.oversamplingPresets);
    insertPresetButtons('digitalPresets', miniPresets.digitalPresets);
    insertPresetButtons('naughtyFilterPresets', miniPresets.naughtyFilterPresets);
}

function insertPresetButtons(id, presetList){     
    var buttonContainer = document.getElementById(id);
    presetList.forEach(function(preset) {
        var button = document.createElement('button');
        button.textContent = preset.name;
        button.addEventListener('click', function() {
            loadPatches(preset.patch);
        });
        buttonContainer.appendChild(button);
    });
}


function loadPatches(patch, patchA, patchB, patchAR, patchBR, testSubjectList) {
    try{
        startSuspendPreviewUpdates();
        commonSectionNames.forEach((sectionName)=>{
            loadPatchIntoContainer(sectionName, patch);
        });
        if(testSubjectList)
        {
            loadTestSubjectList(testSubjectList);
        }
        loadPatchIntoContainer('SoundASetup', patchA ?? patch);
        loadPatchIntoContainer('SoundBSetup', patchB ??patch);
        loadPatchIntoContainer('SoundARSetup', (patchAR ?? patchA) ?? patch);
        loadPatchIntoContainer('SoundBRSetup', (patchBR ?? patchB) ??patch);
    }
    finally{
        endSuspendPreviewUpdates();
        updateAllLabelsAndCachePatches();
        updateAllPreviews();
        flags.changed = true;
    }
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
}



function updateAllLabelsAndCachePatches(syncLeftToRightValues = false){
    let patch = {};
    commonSectionNames.forEach((sectionName)=>{
        loadSliderValuesFromContainer(sectionName, patch);
    });
    commonSectionNames.forEach((sectionName)=>{
        updateLabelsFor(sectionName, patch);
    });
    commonSectionNames.forEach((sectionName)=>{
        handleDisableGroups(sectionName, patch);
    });
    let cachedPatches ={
        Cmn: {...patch},
    }

    loadSliderValuesFromContainer('SoundASetup', patch);
    cachedPatches.A = {...patch};
    updateLabelsFor('SoundASetup', patch);
    handleDisableGroups('SoundASetup', patch);

    if (syncLeftToRightValues){
        loadPatchIntoContainer('SoundARSetup', patch);
    }
    else{
        loadSliderValuesFromContainer('SoundARSetup', patch);
    }
    cachedPatches.AR = {...patch};
    updateLabelsFor('SoundARSetup', patch);
    handleDisableGroups('SoundARSetup', patch);

    loadSliderValuesFromContainer('SoundBSetup', patch);
    cachedPatches.B = {...patch};
    updateLabelsFor('SoundBSetup', patch);
    handleDisableGroups('SoundBSetup', patch);

    if (syncLeftToRightValues){
        loadPatchIntoContainer('SoundBRSetup', patch);
    }
    else{
        loadSliderValuesFromContainer('SoundBRSetup', patch);
    }
    cachedPatches.BR = {...patch};
    updateLabelsFor('SoundBRSetup', patch);
    handleDisableGroups('SoundBRSetup', patch);

    setCachedPatches(cachedPatches);
}


//Main method for displaying values on GUI
//Only method that knows specifics about the values of sliders and their meaning
function updateLabelsFor(containerId, patch) {
    var element = document.getElementById(containerId);
    var valueElements = element.querySelectorAll('.valueSpan');
    valueElements.forEach(function(ve) {
        setValueFromPatch(ve, patch);
    });
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Collapsing Containers
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const headers = document.querySelectorAll('.collapsible-header');
const globalToggle = document.getElementById('globalToggle');

const toggleSection = (header) => {
    const content = header.nextElementSibling;
    const chevron = header.querySelector('.chevron');
    const headerText = header.querySelector('.header-text');

    if (content.style.maxHeight) {
        //Collapse the section
        content.style.maxHeight = null;
        chevron.classList.remove('rotate'); // Rotate chevron back
        headerText.classList.remove('fade-out'); // Restore text opacity
    } else {
        //Expand the section
        content.style.maxHeight = content.scrollHeight + "px";
        chevron.classList.add('rotate'); // Rotate chevron to indicate open
        headerText.classList.add('fade-out'); // Fade out the header text
    } 
};


headers.forEach(header => {
    header.addEventListener('click', function() {
        toggleSection(this);
        updateGlobalToggleText();
    });
});

function toggleGlobalExpander(){
    const shouldExpand = globalToggle.textContent.includes('Expand');
    headers.forEach(header => {
        const content = header.nextElementSibling;
        if ((shouldExpand && !content.style.maxHeight) || (!shouldExpand && content.style.maxHeight)) {
            toggleSection(header);
        }
    });
    updateGlobalToggleText();
};

const updateGlobalToggleText = () => {
    const total = headers.length;
    let expanded = 0;
    headers.forEach(header => {
        if (header.nextElementSibling.style.maxHeight) {
            expanded++;
        }
    });
    if (expanded === 0 || expanded < total / 2) {
        globalToggle.textContent = 'Expand All';
    } else {
        globalToggle.textContent = 'Collapse All';
    }
};

//setTimeout(toggleGlobalExpander, 10);

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Import/Export Patch
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function exportCombinedPatchToJSON(){
    updateAllLabelsAndCachePatches();
    const notesEdit = document.getElementById('notesEdit');
    const cachedPatches = getCachedPatches();
    let patch = { 
        patchC: {...cachedPatches.Cmn}, 
        patchA: {...cachedPatches.A},
        patchAR: {...cachedPatches.AR},
        patchB: {...cachedPatches.B},
        patchBR: {...cachedPatches.BR},
        testSubjects: getTestSubjectList(),
        isStereo: flags.isStereo,
        isNormToLoudest: flags.isNormToLoudest,
        notes: notesEdit? notesEdit.value : "",
        sampleWave: lastSetWave
    };
    return JSON.stringify(patch);
}



function importCombinedPatchFromJSON(json){
    // Initialize with default values
    let patch = JSON.parse(json);
    importCombinedPatchFromPatch(patch);
}
function importCombinedPatchFromPatch(patch){

    let patchC = {...getDefaultPatch()};
    let patchA = {...getDefaultAPatch()};
    let patchB = {...getDefaultBPatch()};
    let patchAR = {...getDefaultBPatch()};
    let patchBR = {...getDefaultBPatch()};

    // Overwrite with values from patch object
    Object.assign(patchC, patch.patchC);
    Object.assign(patchA, patch.patchA);
    Object.assign(patchB, patch.patchB);
    Object.assign(patchAR, patch.patchAR);
    Object.assign(patchBR, patch.patchBR);
    
    // Load the patches and settings
    flags.isStereo = patch.isStereo ?? false;
    flags.isNormToLoudest = patch.isNormToLoudest ?? true;

    const notesEdit = document.getElementById('notesEdit');
    notesEdit.value = patch.notes ?? "";
    
    doSetSampledWave(patch.sampleWave, false);//If already loaded, will be instant so updateBufferEvenIfInstant=false - allows to avoid calculation but will do calc if fetch is needed since it will be delayed

    loadPatches(patchC, patchA, patchB, patchAR, patchBR, patch.testSubjects ?? defaultTestSubjectList);
    updatePreviewButtonState();
}


function saveFullPatchToFile(){
    let json = exportCombinedPatchToJSON();
    n_saveToFile(json)
}
function loadFullPatchFromFile(){
    n_loadFromFile(json=>importCombinedPatchFromJSON(json));

}
function saveFullPatchToClipboard(){
    let json = exportCombinedPatchToJSON();
    n_saveToClipboard(json)
}
function loadFullPatchFromClipboard(){

    n_loadFromClipboard(json=>importCombinedPatchFromJSON(json));
}

// Save to file
function n_saveToFile(json) {
    let blob = new Blob([json], {type: "application/json"});
    let url = URL.createObjectURL(blob);

    let link = document.createElement('a');
    link.download = 'filename.json';
    link.href = url;
    link.click();

    URL.revokeObjectURL(url);
}

// Load from file
function n_loadFromFile(loadProc) {
    return new Promise(() => {
        let input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';

        input.onchange = (event) => {
            let file = event.target.files[0];

            let reader = new FileReader();
            reader.onload = (event) => {
                let contents = event.target.result;
                console.log("Load from file access complete!");
                console.log(contents) 
                loadProc(contents)
            };
            reader.onerror = (error) => {
                console.error("File could not be read! Code " + event.target.error.code);
            };

            reader.readAsText(file);
        };

        input.click();
    });
}

// Save to clipboard
function n_saveToClipboard(json) {
    navigator.clipboard.writeText(json).then(() => {
        //console.log('Copying to clipboard was successful!');
    }, (err) => {
        console.error('Could not copy text: ', err);
    });
}

// Load from clipboard
function n_loadFromClipboard(loadProc) {
    return navigator.clipboard.readText().then((text) => {
        console.log('Pasted content: ', text);
        loadProc(text)
        return text;
    }, (err) => {
        console.error('Could not paste text: ', err);
    });
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Server preset Patch list
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
let serverPresetList = [];
fetch('./presets/presetList.json')
    .then(response => response.json())
    .then(list => {
        if (!Array.isArray(list)) throw new Error('Preset list is not an array');
        list.forEach(file => {
            if (file.name && file.path && file.path.endsWith('.json')) {
                serverPresetList.push(file);
            }
    })})
    .then(() => {
        loadPresetListIntoDropdown( serverPresetList);
        loadParamsFromURL();
    })
    .catch((error) => {
        console.error('Error:', error);
    });

let presetSelect = document.getElementById('serverPresetList');
function loadPresetListIntoDropdown(list) {
    presetSelect.innerHTML = '';

    let defOption = document.createElement('option');
    defOption.textContent = "Select Preset (from Server)";
    defOption.value = "";
    presetSelect.appendChild(defOption);

    list.forEach(item => {
        let option = document.createElement('option');
        option.textContent = item.name;
        option.value = item.path;
        presetSelect.appendChild(option);
    });


    presetSelect.addEventListener('change', () => {
        if (!presetSelect.value || presetSelect.value === "") return;
        loadPresetFromServer(presetSelect.value);
    });

}

function loadPresetFromServer(name){
    fetch(`./presets/${name}`)
    .then(response => response.json())
    .then(patch => {
        importCombinedPatchFromPatch(patch)
        console.log("Patch loaded from server: " + name )
        presetSelect.value = name;  
    })
    .catch((error) => {
        console.error('Error fetching Preset List:', error);
    });
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Wave file import 
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
let serverWaveList = [];
let serverWavePromise =fetchWaveListAsync();
serverWavePromise.then(newList => {
        serverWaveList = newList;
        loadWaveListIntoDropdown(newList);
        loadParamsFromURL();
    })
    .catch((error) => {
        console.error('Error fetching Wave List:', error);
    });


let waveSelect = document.getElementById('serverWaveList');
function loadWaveListIntoDropdown(list) {
    waveSelect.innerHTML = '';

    let defOption = document.createElement('option');
    defOption.textContent = "Select Sample wave";
    defOption.value = "";
    waveSelect.appendChild(defOption);

    list.forEach(item => {
        let option = document.createElement('option');
        option.textContent = item;
        option.value = item;
        waveSelect.appendChild(option);
    });


    waveSelect.addEventListener('change', () => {
        doSetSampledWave(waveSelect.value);
    });

}

let lastSetWave = null;
function doSetSampledWave(waveName, updateBufferEvenIfInstant = true){
    lastSetWave = waveName;
    setSampledWave(waveName, updateBufferEvenIfInstant);
    waveSelect.value = waveName;
}   




//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Load Parameters from URL
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let params = new URLSearchParams(window.location.search);

function loadParamsFromURL(){    
    if (serverWaveList.length>0 && serverPresetList.length>0){//Wait until both lists are loaded  
        if (params.has('preset')) {
            let preset = `${params.get("preset")}.json`;
            if (serverPresetList.some((p)=> p.path === preset )){
                loadPresetFromServer(preset)
            }
        }
    }
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Setup which variables are going to be changeable individually for sounds
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Select all divs with the 'slider-container' class
let sliderContainers = [];
let SoundSetups = [                
    {
        label:'A',
        container:document.getElementById('SoundASetup'),
        containerR:document.getElementById('SoundARSetup')
    },
    {
        label:'B',
        container: document.getElementById('SoundBSetup'),
        containerR:document.getElementById('SoundBRSetup')
    }
];

function getSliderElements (sliderContainer){
    return {
        div:sliderContainer,
        sliders:sliderContainer.querySelectorAll('input[type=range]'),
        labels:sliderContainer.querySelectorAll('label'),
        outputs:sliderContainer.querySelectorAll('output')
    }
}

// For each div
document.querySelectorAll('.slider-container').forEach((div) => {
    let ctrls =getSliderElements(div);

    let name = ctrls.sliders[0].name;
    div.setAttribute('data-name',name);

    let checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('data-target', name);
    checkbox.addEventListener('change', () => {
        // If checkbox is checked
        if (checkbox.checked) {
            SoundSetups.forEach((setup) => {  
                setupSliderCopy(name, div, setup.container, setup.label);
                if (flags.isStereo) setupSliderCopy(name, div, setup.containerR, setup.label + "R")
            })
            
            // Disable the div
            ctrls.sliders.forEach((input)=>{
                input.style.pointerEvents = 'none';
                input.style.opacity = '0.3';
            });
            ctrls.labels.forEach((input)=>{
                input.style.opacity = '0.5';
            });
            ctrls.outputs.forEach((input)=>{
                input.style.opacity = '0.3';
            });
        } else {
            // Enable the div
            ctrls.sliders.forEach((input)=>{
                input.style.pointerEvents = 'auto';
                input.style.opacity = '1';
            });
            ctrls.labels.forEach((input)=>{
                input.style.opacity = '1';
            });
            ctrls.outputs.forEach((input)=>{
                input.style.opacity ='1';
            });
            
            // Remove the copies from 'SoundASetup' and 'SoundBSetup'
            SoundSetups.forEach((setup) => {
                let copies = 
                    [...setup.container.querySelectorAll('[data-name="'+name+'"]'),
                    ...setup.containerR.querySelectorAll('[data-name="'+name+'"]')];
                copies.forEach(copy=>copy.parentNode.removeChild(copy));
            });
        }
        handleValueChange();
    });

    // Add the checkbox to the div
    div.insertBefore(checkbox, div.firstChild);
    sliderContainers.push(
        {
            parentId:div.parentNode.parentNode.id,
            name:name,
            div:div,
            checkbox:checkbox,
            sliders:ctrls.sliders,
            labels:ctrls.labels,
            outputs:ctrls.outputs
        });
});

function setupSliderCopy(name, div, container, ext) {
    let existing = container.querySelector('[data-name="'+name+'"]');
    if (existing)
    {   //Already exists 
        container.appendChild(existing);
        return;           
    } 
    let copy = div.cloneNode(true);
    setupNewSliderContainer(copy);
    // Change the ID of labels and ranges and reset if source is disabled
    copy.querySelectorAll('label').forEach((label) => {
        label.htmlFor += ext;
        label.style.opacity = '1';
    });
    copy.querySelectorAll('input[type=range]').forEach((input)=>{
        input.id += ext;
        input.style.pointerEvents = 'auto';
        input.style.opacity = '1';
    });
    copy.querySelectorAll('output').forEach((output)=>{
        output.style.opacity = '1';
    });
    copy.querySelectorAll('input[type=checkbox]').forEach((input)=>{
        input.classList.add('hiddenCheckbox');
    });
    copy.querySelectorAll('.help-icon').forEach((helpIcon)=>{
        helpIcon.addEventListener('click', helpClickHandler);//make help popups work
    });
    container.appendChild(copy);
}


function loadTestSubjectList(list)
{
    if (!list) return;
    sliderContainers.forEach(
        (container)=>{
            //Could be more efficient, but this works when switching from mono to stereo
            container.checkbox.checked = list.includes(container.name);
            const event = new Event('change');
            container.checkbox.dispatchEvent(event);
        }
    );
}

function getTestSubjectList(){
    let list = [];
    sliderContainers.forEach(
        (container)=>{
            if (container.checkbox.checked) list.push(container.name);
        }
    );
    return list;
}


function handleDisableGroups(id, patch){
    const testSubjects = getTestSubjectList();
    disableGroups.forEach((group)=>{
        
        let allNamesValid = true;
        const hasKeys = group.mains.length>0;
        let matchAnys = false;
        let matchAlls = true;
        for (let key of group.mains) {
            allNamesValid &=  !testSubjects.includes(key.name) 
            matchAlls &=  patch[key.name] == key.value //normally disable when all the keys match
            if (key.matchAny)
            {
                //Allow to disable groups when any of the keys match
                matchAnys |=  patch[key.name] == key.value 
            }
        }
        const action =  allNamesValid && (matchAlls || matchAnys) && hasKeys ?
            (slider)=>slider.classList.add("blurredDisabled")
            : (slider)=>slider.classList.remove("blurredDisabled");
        // const testSliders =SoundSetups.reduce((setup,prev) => 
        // { 

        // },[]);
        const slidersForId =
            [ ...sliderContainers.filter((container)=>container.parentId ==id),
              ...SoundSetups.reduce((prev, setup) =>[...prev,setup.container,setup.containerR],[])
                .filter((container)=>container.id ==id)
                .reduce((prev,container)=> //Get all the sliders in the container, if there is a match
                [
                    ...prev,
                    ...container.querySelectorAll('.slider-container')
                ],[])
                .reduce((prev,sliderContainer)=>{ // recreate the sliderContainer object
                    const ctrls =getSliderElements(sliderContainer);
                    ctrls.name = ctrls.sliders[0].name;
                    return [...prev,ctrls];
                },[])
            ];
        slidersForId.filter((container)=>group.dependents.includes(container.name))
            .forEach((container)=>{
                container.sliders.forEach((slider)=>
                {
                    action(slider)
                })
                container.labels.forEach((slider)=>
                {
                    action(slider)
                })
                container.outputs.forEach((slider)=>
                {
                    action(slider)
                })
            });
        
        slidersForId.filter((container)=> container.sliders && container.sliders.length>1)
            .forEach((container)=>{
                container.sliders.forEach((slider)=>
                {
                    if (group.dependents.includes(slider.name))
                    {
                        action(slider);
                    }
                })
            })
        slidersForId.filter((container)=> container.labels && container.labels.length>1)
            .forEach((container)=>{
                container.labels.forEach((label)=>
                {
                    if (group.dependents.includes(label.htmlFor))
                    {
                        action(label);
                    }
                })
            })
        slidersForId.filter((container)=> container.outputs && container.outputs.length>1)
            .forEach((container)=>{
                container.outputs.forEach((slider)=>
                {
                    if (group.dependents.includes(slider.name))
                    {
                        action(slider);
                    }
                })
            })
        }
    );
}



//Initialise display of waveform and audio buffers on first load
initSliders();

//console.log("TestSubjectList: " + getTestSubjectList());    

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Functions for handling switching from mono to stereo
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
let hideOnMonos = document.querySelectorAll('.hideForMono');
let hideForStereo = document.querySelectorAll('.hideForStereo');
hideOnMonos.forEach((element)=>element.style.display = flags.isStereo? 'block':'none');

function setUpStereo(syncValuesFromLeftToRight){
    if (flags.isStereo) {
        //Just led the testSubject list again
        loadTestSubjectList(getTestSubjectList())
        hideOnMonos.forEach((element)=>element.style.display = 'block');
        hideForStereo.forEach((element)=>element.style.display = 'none');
        if (syncValuesFromLeftToRight) 
        {
            updateAllLabelsAndCachePatches(true)
        }
    }
    else {
        //Remove all the stereo copies
        SoundSetups.forEach((setup) => {
            setup.containerR.querySelectorAll('.slider-container')
                .forEach(copy=>copy.parentNode.removeChild(copy));
        });
        
        hideForStereo.forEach((element)=>element.style.display = 'block');
        hideOnMonos.forEach((element)=>element.style.display = 'none');
    }
    flags.changed = true;
}
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//ABX TEST GUI Code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


let abxTestChoice;
let abxCount =0;
let abxScore =0;
function playABX(){  
    colorPlayButtons(3);  
    if (abxTestChoice === 0) {
        play(0);
    } else {
        play(1);
    }
}

document.getElementById('abxTest').addEventListener('click', function() {
    abxTestChoice = Math.round(Math.random());
    document.querySelectorAll('.abxTestButtons').forEach(b=>b.classList.remove('show'));
    document.querySelectorAll('.abxAnswerButtons').forEach(b=>b.classList.add('show'));
    document.getElementById('resetTest').style.display = 'block';
    playABX();
});

document.querySelector('.playX').addEventListener('click', function() {
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
    document.querySelectorAll('.abxTestButtons').forEach(b=>b.classList.add('show'));
    document.querySelectorAll('.abxAnswerButtons').forEach(b=>b.classList.remove('show'));
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
    document.querySelectorAll('.abxTestButtons').forEach(b=>b.classList.add('show'));
    document.querySelectorAll('.abxAnswerButtons').forEach(b=>b.classList.remove('show'));
    
    const stats = document.getElementById('stats');
    stats.textContent = 'Score: ' + abxScore + '/' + abxCount +'  ' + Math.round(abxScore / abxCount * 100).toFixed(0) + '%' ;
}



document.getElementById('mushraTest').addEventListener('click', function() {
    document.getElementById('mushraModal').style.display = 'flex';
    document.getElementById('mushraModalBackground').style.display = 'flex';
    document.getElementById('mushraResultsModal').style.display = 'none';
    doInitMushra();
  });
  document.getElementById('startMushra').addEventListener('click', function() {
    let cachedPatches = getCachedPatches();
    doStartMushra(
        [
            cachedPatches.A, 
            flags.isStereo ? cachedPatches.AR : null, 
            cachedPatches.B,
            flags.isStereo ? cachedPatches.BR : null
        ], 
        getTestSubjectList(),
        getTrueSampleRate(),
        flags.isNormToLoudest);
  });
  
  document.querySelectorAll('.closeMushra').forEach(b=>{
        b.addEventListener('click', function() {
            shutDownMushraAndStopAudio();
            document.getElementById('mushraModal').style.display = 'none';
            document.getElementById('mushraModalBackground').style.display = 'none';
            document.getElementById('mushraResultsModal').style.display = 'none';
        });
    });

    setResultsStyle(true, true, true);
 
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Help pop up trigger code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let helpIcons = document.querySelectorAll('.help-icon');

helpIcons.forEach(function(helpIcon) {
    helpIcon.addEventListener('click', helpClickHandler);
});

function helpClickHandler(event) {
    event.stopPropagation();
    clearHelp();
    let helpPopup = this.nextElementSibling;
    helpPopup.style.display = 'block';
    let rect = helpPopup.getBoundingClientRect();
    if (rect.top < 0) {
        helpPopup.style.top = 10 + 'px'; // Add 10px for a small margin
    }
}

document.addEventListener('click', function() {
    clearHelp();
});

function clearHelp(){
    let helpPopups = document.querySelectorAll('.help-popup');
    helpPopups.forEach(function(helpPopup) {
        helpPopup.style.display = 'none';
    });
}
