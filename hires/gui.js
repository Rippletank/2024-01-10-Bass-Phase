
import { doShutDownMushra, startListening, stopListening, doInitMushra,doStartMushra, checkSampleRateStatus} from "./audioApi.js";
import { repaintMushra } from '../sharedGui/mushra.js';
import { setValueFromPatch } from "./guiValues.js";
import { getDefaultPatch } from "../sharedAudio/defaults.js";
import { fetchWaveListAsync } from '../sharedGui/waves.js';



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Connect GUI to the audio engine
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

document.getElementById("start96kTest").addEventListener("click", function() {
    const header =document.getElementById("testInterface");
    toggleSection(header);
    header.scrollIntoView({ behavior: 'smooth' });   
});

document.getElementById("listenInterfaceTest").addEventListener("click", function() {
    startListening()
    document.getElementById("listenInterfaceTest").classList.add('selected');
});
document.getElementById("stopInterfaceTest").addEventListener("click", function() {
    stopListening()
    document.getElementById("listenInterfaceTest").classList.remove('selected');
});

document.getElementById('mushraTest').addEventListener('click', function() {
    document.getElementById('mushraModal').style.display = 'flex';
    document.getElementById('mushraModalBackground').style.display = 'flex';
    document.getElementById('mushraResultsModal').style.display = 'none';
    doInitMushra();
    doStartMushra(lastSetWave,cachedPatch);
  });

  document.getElementById('startMushra').addEventListener('click', function() {
    doStartMushra(lastSetWave,cachedPatch);
  });
  
  document.querySelectorAll('.closeMushra').forEach(b=>{
        b.addEventListener('click', function() {
            doShutDownMushra();
            document.getElementById('mushraModal').style.display = 'none';
            document.getElementById('mushraModalBackground').style.display = 'none';
            document.getElementById('mushraResultsModal').style.display = 'none';
        });
    });


    document.getElementById('status96k').innerHTML = checkSampleRateStatus();


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Resize and document level control
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


//Canvas resize handler
let canvases = document.querySelectorAll('canvas');
window.addEventListener('resize', updateCanvas);
function updateCanvas() {
    adjustViewport();
    canvases.forEach((canvas)=>{
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    });
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
    if(globalToggle){
        if (expanded === 0 || expanded < total / 2) {
            globalToggle.textContent = 'Expand All';
        } else {
            globalToggle.textContent = 'Collapse All';
        }
    }
};




let collapsibleContent = document.querySelectorAll('.collapsible-content');

// Add an event listener for the transitionend event
collapsibleContent.forEach(cc=>cc.addEventListener('transitionend', function() {
    // Scroll the div into view
    cc.scrollIntoView({ behavior: 'smooth' });
}));



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Slider handling
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
let lastUpdate=0;
let changed = true;
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
    changed = true;
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


function updateAllLabelsAndCachePatches()
{
    let patch = {};
    loadSliderValuesFromContainer('testSetup', patch);
    updateLabelsFor('testSetup', patch);
    cachedPatch = patch;
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Handling Patch holding parameters 
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function getHiResDefaultPatch(){
    let p = getDefaultPatch();
    //one tone
    p.inharmonicAFrequency = 25000;
    p.inharmonicALevel = -30;

    //two tone
    p.inharmonicDFrequency = 25000;
    p.inharmonicDLevel = -30;
    p.inharmonicEFrequency = 26000;
    p.inharmonicELevel = -30;

    //Noise
    p.inharmonicNoiseLevel = -30;
    p.inharmonicNoiseColour = 0;  

    //Distortion
    p.distortion =1;
    p.tanhDistortion = 1;

    //Hi pass filter
    p.ultraSonicCutOff = 22000;
    return p;
}


let cachedPatch =  getHiResDefaultPatch();

//Main method for displaying values on GUI
//Only method that knows specifics about the values of sliders and their meaning
function updateLabelsFor(containerId, patch) {
    var element = document.getElementById(containerId);
    var valueElements = element.querySelectorAll('.valueSpan');
    valueElements.forEach(function(ve) {
        setValueFromPatch(ve, patch);
    });
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
    updateLabelsFor(id, patch);
}

///++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Trigger init
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function initSliders(){
    wireUpSlidersForContainer('testSetup');
    loadPatchIntoContainer('testSetup', cachedPatch)
    updateAllLabelsAndCachePatches();
}


initSliders()


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Wave file import 
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
let serverWaveList = [];
let serverWavePromise =fetchWaveListAsync();
serverWavePromise.then(newList => {
        serverWaveList = newList;
        loadWaveListIntoDropdown(newList);
    })
    .catch((error) => {
        console.error('Error fetching Wave List:', error);
    });


let waveSelect = document.getElementById('serverWaveList');
function loadWaveListIntoDropdown(list) {
    waveSelect.innerHTML = '';


    list.forEach(item => {
        let option = document.createElement('option');
        option.textContent = item;
        option.value = item;
        waveSelect.appendChild(option);
    });


    waveSelect.addEventListener('change', () => {
        doSetSampledWave(waveSelect.value);
    });
    doSetSampledWave('Drums');
}

let lastSetWave = null;
function doSetSampledWave(waveName){
    lastSetWave = waveName;
    changed = true;
    waveSelect.value = waveName;
}  

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






export {}