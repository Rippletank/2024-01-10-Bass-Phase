
import { startListening, doInitMushra,doStartMushra} from "./audioApi.js";
import { shutDownMushra, repaintMushra } from '../sharedGui/mushra.js';



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Connect GUI to the audio engine
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

document.getElementById("start96kTest").addEventListener("click", function() {
    startListening()
});

document.getElementById('mushraTest').addEventListener('click', function() {
    document.getElementById('mushraModal').style.display = 'flex';
    document.getElementById('mushraModalBackground').style.display = 'flex';
    document.getElementById('mushraResultsModal').style.display = 'none';
    doInitMushra();
  });

  document.getElementById('startMushra').addEventListener('click', function() {
    doStartMushra();
  });
  
  document.querySelectorAll('.closeMushra').forEach(b=>{
        b.addEventListener('click', function() {
            shutDownMushra();
            document.getElementById('mushraModal').style.display = 'none';
            document.getElementById('mushraModalBackground').style.display = 'none';
            document.getElementById('mushraResultsModal').style.display = 'none';
        });
    });




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


export {}