//web audio api objects
let audioContext = null;
let analyserNode = null;
let sourceNode = null;

const fftSize = 4096*8;
const requestedSampleRate = 96000;
function ensureAudioContext(){
    if (!audioContext){
        //Will throw a warning in some browsers if not triggered by a user action
        //On page start up this is called anyway to get the playback samplerate to use for buffer generation
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate:requestedSampleRate}); 
        console.log('Sample rate: ' + audioContext.sampleRate + 'Hz')
        analyserNode = audioContext.createAnalyser();//blackman window with default smoothing 0.8
        analyserNode.fftSize = fftSize;
        analyserNode.smoothingTimeConstant = 0.0;
        analyserNode.minDecibels = -120;
        analyserNode.maxDecibels = 0;
    }
}


export function startListening(){


}