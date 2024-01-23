//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//GUI Code
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
//GUI/Audio/WebAudioAPI linking code knows about each area of concern
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let audioContext = null;
let sourceNode = null;
let analyserNode = null;
let audioBufferA = null;
let audioBufferB = null;
let nullTestBuffer = null;
let nullTestMax = 0;

function ensureAudioContext(){
    if (!audioContext){
        //Will throw a warning in some browsers if not triggered by a user action
        //On page start up this is called anyway to get the playback samplerate to use for buffer generation
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyserNode = audioContext.createAnalyser();//blackman window with default smoothing 0.8
        analyserNode.fftSize = 4096*8;
        analyserNode.smoothingTimeConstant = 0.0;
        analyserNode.minDecibels = -90;
        analyserNode.maxDecibels = 0;
    }
}


// Play method, index 0 = A, 1 = B
function play(index) {
    ensureAudioContext();
    //Can't reuse source node so create a new one
    stop();
    let newSourceNode = audioContext.createBufferSource();
    if (changed || generatedSampleRate != audioContext.sampleRate){
        updateBuffersAndDisplay();
    }
    newSourceNode.buffer = index==0 ? audioBufferA : (index==1 ? audioBufferB: nullTestBuffer);
    if (useFFT){
        newSourceNode.connect(analyserNode);
        analyserNode.connect(audioContext.destination);
    }
    else{
        newSourceNode.connect(audioContext.destination);
        analyserNode.disconnect();
    }
    newSourceNode.onended = ()=>{
        if (newSourceNode==sourceNode)
        {
            stop();
        }   
    }
    sourceNode = newSourceNode;
    newSourceNode.start(0);
    startFFT();
}

function stop() {
    if (sourceNode) {
        sourceNode.stop(0);
        sourceNode.disconnect();
        sourceNode = null;
        cancelAnimationFrame(fftFrameCall);
        fftFrameCall = null;
        fftClear();
    }
}

let useFFT = true;

function fftClear(){
    let canvas = document.getElementById('fftCanvas');
    let ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "rgb(240, 240, 240)";
    ctx.fillRect(0, 0, w, h);  
}



let fftFrameCall = null;
const fftStartF = 20;
const fftEndF = 20000;
function startFFT(){
    if (fftFrameCall) return;
    if (!useFFT) {
        fftClear();
        return;
    }
    let canvas = document.getElementById('fftCanvas');
    let ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const bufferLength = analyserNode.fftSize;
    const maxLogF = Math.log2(fftEndF-fftStartF);
    const octaveStep = maxLogF / w;
    const freqStep = bufferLength / audioContext.sampleRate;
    const hScale = h / 256;
    const fft = new Uint8Array(bufferLength);
    const bins = new Uint8Array(w);
    const fftDraw =()=>{
        fftFrameCall = requestAnimationFrame(fftDraw);
        analyserNode.getByteFrequencyData(fft);  
        ctx.fillStyle = "rgb(240, 240, 240)";
        ctx.fillRect(0, 0, w, h);        
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = "rgb(0, 0, 0)";
        ctx.beginPath();

        let startBin = 0;
        for (let i = 0; i < w; i++) {
            let endOctave = (i+1) * octaveStep;
            let endBin = Math.round((fftStartF + Math.pow(2,endOctave))  * freqStep );
            if (endBin>startBin){
                let max = 0;
                for (let j = startBin; j < endBin; j++) {
                    max = Math.max(max,fft[j]);
                }
                let y = h - max * hScale;
                if (i === 0) {
                    ctx.moveTo(i, y);
                } else {
                    ctx.lineTo(i, y);
                }
                startBin = endBin;
            }
        }
        ctx.stroke();
    }
    fftDraw();
}

   
// Main update method - orchestrates the creation of the buffers and their display
//Called at startup and whenever a parameter changes
function updateBuffersAndDisplay() {
    changed = false;
    ensureAudioContext();
    let t0 = performance.now();

    updateBuffers();
    updateDisplay();

    let t1 = performance.now();
    console.log("Execution time: " + (t1 - t0) + " milliseconds.");
}



function updateBuffers() {
    //Collect parameters from GUI
    let patch = getDefaultPatch();
    loadSliderValuesFrom('CommonSettings', patch);
    loadSliderValuesFrom('TestSetup', patch);
    let sampleRate = audioContext ? audioContext.sampleRate: 44100;
    generatedSampleRate = sampleRate;//Store to check later, if changed then regenerate buffers to prevent samplerate conversion artefacts as much as possible
    
    //Inefficient to create two buffers independently - envelope and all higher harmonics are the same, but performance is acceptable and code is maintainable
    
    loadSliderValuesFrom('SoundASetup', patch);
    audioBufferA = getAudioBuffer(
        sampleRate, 
        patch
    );

    loadSliderValuesFrom('SoundBSetup', patch);
    audioBufferB = getAudioBuffer(
        sampleRate, 
        patch
    );

    nullTestBuffer = buildNullTest(audioBufferA, audioBufferB);


    //Normalise buffers - but scale by the same amount - find which is largest and scale to +/-0.99
    let scale = 0.99 / Math.max(getBufferMax(audioBufferA), getBufferMax(audioBufferB));

    scaleBuffer(audioBufferA, scale);
    scaleBuffer(audioBufferB, scale);

    //normalise null test buffer if 
    let nullMax = getBufferMax(nullTestBuffer);
    nullTestMax = 20 * Math.log10(nullMax);//convert to dB
    if (nullTestMax>-100){//avoid scaling if null test is close to silent (>-100db)
        scaleBuffer(nullTestBuffer, 0.99 / nullMax);
    }
}


function loadSliderValuesFrom(id, patch) {
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

    var modeSelectors = element.querySelectorAll('.mode-selection');
    modeSelectors.forEach(function(modeSelector) {
        var radioButtons = modeSelector.querySelectorAll('input[type="radio"]');
        radioButtons.forEach(function(radioButton) {
            if (!radioButton.checked) return;
            var name = radioButton.name;
            var value = parseFloat(radioButton.value);
            patch[name] = value;
        });
    });

}


function updateDisplay(){
    if (!audioBufferA || !audioBufferB || !nullTestBuffer) return;
    let maxLength = Math.max(audioBufferA.length, audioBufferB.length, nullTestBuffer.length);
    paintBuffer(audioBufferA, maxLength, "waveformA");
    paintBuffer(audioBufferB, maxLength, "waveformB");
    paintBuffer(nullTestBuffer, maxLength, "waveformNull");
    let nullTest = document.getElementById('nullTestdb');
    nullTest.textContent = " - Peak:" +nullTestMax.toFixed(1) + "dB";
}


function paintBuffer(buffer, maxLength, canvasId){
    let b = buffer.getChannelData(0);
    let bufferSize = buffer.length;

    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    let x = 0;
    let y = canvas.height/2;
    let step = canvas.width / maxLength;

    for (let i = 0; i < maxLength; i++) {
        if (i >= bufferSize) break;
        ctx.lineTo(x, y + b[i] * y);
        x += step;
    }
    ctx.stroke();
}

 

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//GUI wiring up Code - no knowledge of audio code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let changed = true;
// Attach play and stop methods to the button
document.getElementById('playSoundA').addEventListener('click', function() {
    play(0);
});
document.getElementById('playSoundB').addEventListener('click', function() {
    play(1);
});
document.getElementById('playSoundNull').addEventListener('click', function() {
    play(2);
});
document.getElementById('freq').addEventListener('input', function() {
    document.getElementById('freq-value').textContent = this.value + "Hz";
    updatePhaseLabels();
    changed=true;
});

document.getElementById('attack').addEventListener('input', function() {
    document.getElementById('attack-value').textContent = this.value + "s";
    changed=true;
});

document.getElementById('decay').addEventListener('input', function() {
    document.getElementById('decay-value').textContent = this.value + "s";
    changed=true;
});

document.getElementById('hold').addEventListener('input', function() {
    document.getElementById('hold-value').textContent = this.value + "s";
    changed=true;
});

document.getElementById('second').addEventListener('input', function() {
    document.getElementById('second-value').textContent = this.value;
    changed=true;
});


document.getElementById('odd').addEventListener('input', function() {
    setupLevelLabel("odd", this.value, undefined)
    changed=true;
});

document.getElementById('oddAlternating').addEventListener('input', function() {
    setupLevelLabel("odd", undefined, this.value)
    changed=true;
});

document.getElementById('even').addEventListener('input', function() {
    setupLevelLabel("even", this.value, undefined)
    changed=true;
});
document.getElementById('evenAlternating').addEventListener('input', function() {
    setupLevelLabel("even", undefined, this.value)
    changed=true;
});

function setupLevelLabel(idRoot, level,polarity){
    level = parseFloat(level ?? document.getElementById(idRoot).value);
    polarity =parseFloat(polarity ?? document.getElementById(idRoot + "Alternating").value);
    let value = "off"
    if (level!=0)
    {
        if (polarity==0) 
            value = level.toFixed(1);
        else
            value = level.toFixed(1) +"↔" + (level *(-2 * polarity +1)).toFixed(1);
    }
    document.getElementById(idRoot + '-value').textContent = value;
}

document.getElementById('oddFalloff').addEventListener('input', function() {
    let value = "";
    if (this.value==0) value = "1";
    else if (this.value==1) value = "1/n";
    else value = "1/n<sup>" + this.value + "</sup>";
    document.getElementById('oddFalloff-value').innerHTML = value;
    changed=true;
});





document.getElementById('evenFalloff').addEventListener('input', function() {
    let value = "";
    if (this.value==0) value = "1";
    else if (this.value==1) value = "1/n";
    else value = "1/n<sup>" + this.value + "</sup>";
    document.getElementById('evenFalloff-value').innerHTML = value;
    changed=true;
});

document.getElementById('envelopeFilter').addEventListener('input', function() {
    document.getElementById('envelopeFilter-value').textContent = this.value=="1"? "off" : this.value;
    changed=true;
});

document.getElementById('rootPhaseDelayA').addEventListener('input', function() {
    updatePhaseLabels();
    changed=true;
});

document.getElementById('rootPhaseDelayB').addEventListener('input', function() {
    updatePhaseLabels();
    changed=true;
});

document.getElementById('hideFFT').addEventListener('click', function() {
    useFFT = !useFFT;
    if (!useFFT) fftClear();
    this.textContent = useFFT ? "Hide FFT" : "Show FFT";
});

function updatePhaseLabels(){
    let invFreq = 1000 / (parseFloat(document.getElementById('freq').value) * 2);
    let rootPhaseDelayA = document.getElementById('rootPhaseDelayA').value;
    let rootPhaseDelayB = document.getElementById('rootPhaseDelayB').value;
    let delayA = parseFloat(rootPhaseDelayA) * invFreq;
    let delayB = parseFloat(rootPhaseDelayB) * invFreq;
    document.getElementById('rootPhaseDelayA-value').textContent = rootPhaseDelayA + "π (" + (delayA).toFixed(1) + "ms)";
    document.getElementById('rootPhaseDelayB-value').textContent = rootPhaseDelayB + "π (" + (delayB).toFixed(1) + "ms)";
}


window.addEventListener('resize', updateCanvas);

function updateCanvas() {
    let canvasA = document.getElementById('waveformA');
    let canvasB = document.getElementById('waveformB');

    canvasA.width = canvasA.offsetWidth;
    canvasB.width = canvasB.offsetWidth;
    updateDisplay();
}


let envMode=1;
document.getElementById('envMode1').addEventListener('change', function() {
    if (this.checked) {
        envMode=1;
        changed=true;
    }
});
document.getElementById('envMode2').addEventListener('change', function() {
    if (this.checked) {
        envMode=2;
        changed=true;
    }
});



//Initialise display of waveform and audio buffers on first load
updateBuffersAndDisplay();
updatePhaseLabels();
fftClear();




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
