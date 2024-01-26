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

//Play buttons
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

function play(index){
    playAudio(index, cachedPatchA, cachedPatchB);   
}

//load settings for all of the little green buttons
let previewSubject =0;
let previewButtons = document.querySelectorAll('.previewButton');
previewButtons.forEach(function(button) {
    switch(button.name[0]){    
        case 'P': //patch to use for preview
            let sub =0;
            switch(button.name[1]){
                case 'D': sub=0;break;
                case 'A': sub=1;break;
                case 'B': sub=2;break;
            };
            button.addEventListener('click', function() {
                previewSubject = sub;
                DoFullPreviewUpdate();
            });
            button.isChecked =()=> previewSubject == sub;
        break;
        case 'F': //filter preview options
            let subF =parseInt(button.name[1]);
            button.addEventListener('click', function() {
                filterPreviewSubject = subF;
                DoFullPreviewUpdate();
            });
            button.isChecked =()=> filterPreviewSubject == subF;
        break;
        case 'H'://Harmonics preview view options
            let fh = ()=>{};//function to call when clicked
            let ch = ()=>false;//isChecked function
            switch(button.name){
                case 'HFull': 
                    fh=()=>previewSpectrumFullWidth=!previewSpectrumFullWidth;
                    ch=()=>previewSpectrumFullWidth;
                    break;
                case 'HPhase': 
                    fh=()=>previewSpectrumShowPhase=!previewSpectrumShowPhase;
                    ch=()=>previewSpectrumShowPhase;
                    break;
                case 'HPolarity': 
                    fh=()=>previewSpectrumPolarity=!previewSpectrumPolarity;
                    ch=()=>previewSpectrumPolarity;
                    break;
            }
            button.addEventListener('click', function() {
                fh();
                updatePreviewButtonState();
                paintPreview();
            });
            button.isChecked =ch;
        break;
        case 'D'://Harmonics preview view options
            let fd = ()=>{};//function to call when clicked
            let cd = ()=>false;//isChecked function
            switch(button.name){
                case 'DFull': 
                    fd=()=>distortionSpectrumFullWidth=!distortionSpectrumFullWidth;
                    cd=()=>distortionSpectrumFullWidth;
                    break;
                case 'DPhase': 
                    fd=()=>distortionSpectrumShowPhase=!distortionSpectrumShowPhase;
                    cd=()=>distortionSpectrumShowPhase;
                    break;
                case 'DPolarity': 
                    fd=()=>distortionSpectrumPolarity=!distortionSpectrumPolarity;
                    cd=()=>distortionSpectrumPolarity;
                    break;
            }
            button.addEventListener('click', function() {
                fd();
                updatePreviewButtonState();
                paintPreview();
            });
            button.isChecked =cd;
        break;
        case 'w': //Waveform A/B options
            let fw = ()=>{};//function to call when clicked
            let cw = ()=>false;//isChecked function
            switch(button.name){
                case 'wShowF': 
                    fw=()=>showBufferFilterOverlay=!showBufferFilterOverlay;
                    cw=()=>showBufferFilterOverlay;
                    break;
                case 'wShowEG': 
                    fw=()=>showBufferEnvelopeOverlay=!showBufferEnvelopeOverlay;
                    cw=()=>showBufferEnvelopeOverlay;
                break;
            }
            button.addEventListener('click', function() {
                fw();
                updatePreviewButtonState();
                updateDisplay();
            });
            button.isChecked =cw;
        break;
    }
});

function DoFullPreviewUpdate(){
    updatePreviewButtonState();
    updatePreview();
    paintPreview();
}


function updatePreviewButtonState(){
    previewButtons.forEach((button)=>{
        const checked = button.isChecked();
        button.classList.add(checked ? 'button-selected' : 'button-unselected');
        button.classList.remove(checked ? 'button-unselected' : 'button-selected');
    });
}


//Canvas resize handler
window.addEventListener('resize', updateCanvas);
function updateCanvas() {
    let canvasA = document.getElementById('waveformA');
    let canvasB = document.getElementById('waveformB');
    let canvasN = document.getElementById('waveformNull');
    let canvasP = document.getElementById('wavePreview');

    canvasA.width = canvasA.offsetWidth;
    canvasB.width = canvasB.offsetWidth;
    canvasN.width = canvasN.offsetWidth;
    canvasP.width = canvasN.offsetWidth;
    updateDisplay();
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Generally methods for sliders and preset buttons
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


const commonSectionNames = [
    'CommonSettings', 
    'FilterSetup', 
    'TestSetup', 
    'DistortionSetup'];


function initSliders(){
    //Call once only at startup
    commonSectionNames.forEach((sectionName)=>{
        wireUpSlidersForContainer(sectionName);
    });
    wireUpSlidersForContainer('SoundASetup');
    wireUpSlidersForContainer('SoundBSetup');
    setupPresetButtons();
    updatePreviewButtonState();
    
    loadPatches(getDefaultPatch(),  getDefaultAPatch(), getDefaultBPatch(), defaultTestSubjectList);


    //Check at regular intervals if any sliders have changed and update display if so
    //Add time delay to batch up changes
    setInterval(function() {
        if (changed && Date.now() - lastUpdate > 800) {
            updateBuffersAndDisplay(cachedPatchA, cachedPatchB);
        }
    }, 500); 
}

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
    });
}
function handleValueChange() {
    updateAllLabelsAndCachePatches();
    changed=true;
    lastUpdate = Date.now();
    updatePreview();
    paintPreview();
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
    insertPresetButtons('filterPresetButtons', filterPresets);
    insertPresetButtons('distortionPresets', distortionPresets);
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


function loadPatches(patch, patchA, patchB, testSubjectList) {
    commonSectionNames.forEach((sectionName)=>{
        loadPatchIntoContainer(sectionName, patch);
    });
    if(testSubjectList)
    {
        loadTestSubjectList(testSubjectList);
    }
    loadPatchIntoContainer('SoundASetup', patchA ?? patch);
    loadPatchIntoContainer('SoundBSetup', patchB ??patch);
    updateAllLabelsAndCachePatches();
    updatePreview();
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
}

let cachedPatchCmn = null;
let cachedPatchA = null;
let cachedPatchB = null;
function updateAllLabelsAndCachePatches(){
    let patch = {};
    commonSectionNames.forEach((sectionName)=>{
        loadSliderValuesFromContainer(sectionName, patch);
    });
    commonSectionNames.forEach((sectionName)=>{
        updateLabelsFor(sectionName, patch);
    });
    cachedPatchCmn = {...patch};

    loadSliderValuesFromContainer('SoundASetup', patch);
    cachedPatchA = {...patch};
    updateLabelsFor('SoundASetup', patch);

    loadSliderValuesFromContainer('SoundBSetup', patch);
    cachedPatchB = {...patch};
    updateLabelsFor('SoundBSetup', patch);
}


//Main method for displaying values on GUI
//Only method that knows specifics about the values of sliders and their meaning
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
                ve.textContent = toPercent(patch.distortion);
        }
    });
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





//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Setup which variables are going to be changeable individually for sounds
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Select all divs with the 'slider-container' class
let sliderContainers = [];
let SoundSetups = [                
    {
        container:document.getElementById('SoundASetup'),
        button:document.getElementById('playSoundA')
    },
    {
        container: document.getElementById('SoundBSetup'),
        button:document.getElementById('playSoundB')
    }
];

// For each div
document.querySelectorAll('.slider-container').forEach((div) => {
    let sliders = div.querySelectorAll('input[type=range]');
    let labels = div.querySelectorAll('label');
    let outputs = div.querySelectorAll('output');

    let name = sliders[0].name;
    div.setAttribute('data-name',name);

    let checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('data-target', name);
    checkbox.addEventListener('change', () => {
        // If checkbox is checked
        if (checkbox.checked) {
            SoundSetups.forEach((setup) => {                
                let copy = div.cloneNode(true);
                setupNewSliderContainer(copy);
                // Change the ID of labels and ranges
                copy.querySelectorAll('label').forEach((label) => {
                    label.htmlFor += 'A';
                });
                copy.querySelectorAll('input[type=range]').forEach((input)=>{
                    input.id += 'A';
                });
                copy.querySelectorAll('input[type=checkbox]').forEach((input)=>{
                    input.classList.add('hiddenCheckbox');
                });

                // Add the copies to 'SoundASetup' and 'SoundBSetup'
                if (!setup.container.querySelector('[data-name="'+name+'"]')){
                    setup.container.insertBefore(copy, setup.button);
                }
            })
            
            // Disable the div
            sliders.forEach((input)=>{
                input.style.pointerEvents = 'none';
                input.style.opacity = '0.3';
            });
            labels.forEach((input)=>{
                input.style.opacity = '0.4';
            });
            outputs.forEach((input)=>{
                input.style.opacity = '0.3';
            });
        } else {
            // Enable the div
            sliders.forEach((input)=>{
                input.style.pointerEvents = 'auto';
                input.style.opacity = '1';
            });
            labels.forEach((input)=>{
                input.style.opacity = '1';
            });
            outputs.forEach((input)=>{
                input.style.opacity ='1';
            });
            
            // Remove the copies from 'SoundASetup' and 'SoundBSetup'
            SoundSetups.forEach((setup) => {
                let copy = setup.container.querySelector('[data-name="'+name+'"]');
                copy && copy.parentNode.removeChild(copy);
            });
        }
        handleValueChange();
    });

    // Add the checkbox to the div
    div.insertBefore(checkbox, div.firstChild);
    sliderContainers.push(
        {
            name:name,
            div:div,
            checkbox:checkbox
        });
});


function loadTestSubjectList(list)
{
    if (!list) return;
    sliderContainers.forEach(
        (container)=>{
            const startV =container.checkbox.checked;
            container.checkbox.checked = list.includes(container.name);
            if (startV != container.checkbox.checked)
            {
                const event = new Event('change');
                container.checkbox.dispatchEvent(event);
            }
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

//Initialise display of waveform and audio buffers on first load
initSliders();

console.log("TestSubjectList: " + getTestSubjectList());    
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
