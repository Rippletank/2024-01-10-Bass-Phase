
import { startListening } from "./audioApi.js";



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Connect GUI to the audio engine
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

document.getElementById("start96kTest").addEventListener("click", function() {
    startListening()
});



//Canvas resize handler
let canvases = document.querySelectorAll('canvas');
window.addEventListener('resize', updateCanvas);
function updateCanvas() {
    adjustViewport();
    canvases.forEach((canvas)=>{
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    });
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


export {}