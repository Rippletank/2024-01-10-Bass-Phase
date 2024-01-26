//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio Code - fort distortion and FFT of result
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
//FFT Code developed using following sources:
//wikipedia: https://en.wikipedia.org/wiki/Fast_Fourier_transform
//https://en.m.wikipedia.org/wiki/Cooley%E2%80%93Tukey_FFT_algorithm
//https://vanhunteradams.com/FFT/FFT.html#Identifying-a-regression
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Kippel loudspeaker models - for reference on distortion in speakers

//Perform distortion on buffer in place
function distort(buffer, patch, sampleRate){
    if (patch.distortion==0) return;
    const d=1.01-patch.distortion/0.99;
    for(let i=0;i<buffer.length;i++){
        let v =buffer[i];
        buffer[i] = Math.abs(v) > d ? d*Math.sign(v) : v;
    }
}

let getFFT = (buffer)=>null;
function initFFT()
{
    //FFT always of length 1024 - so bit reversals and sin lUT can be precalculated
    const N = 1024;
    const N_1 =N-1;
    const N_4 =N/4;
    const logN = Math.log2(N);
    const shift = 16-logN;
    let bitReversals = [];
    //Bit reversal precalculation
    //https://vanhunteradams.com/FFT/FFT.html#Generalized-code
    //who referenced https://graphics.stanford.edu/~seander/bithacks.html#BitReverseObvious
    //Leave first and last in place
    let mr = 0;
    for(let m=1;m<N_1;m++){
        mr =((m>>1)  & 0x5555)|((m  & 0x5555)<<1);
        mr =((mr>>2) & 0x3333)|((mr & 0x3333)<<2);
        mr =((mr>>4) & 0x0f0f)|((mr & 0x0f0f)<<4);
        mr =((mr>>8) & 0x00ff)|((mr & 0x00ff)<<8);
        mr = mr>>shift;
        if (mr<=m) continue;
        bitReversals.push([m,mr]);
    }

    //Sin LUT precalculation
    const sinLUT = new Array(N);
    const w =2*Math.PI/N;//rads per sample
    for(let i=0;i<N;i++){
        sinLUT[i] = Math.sin(w*i) * 0.5;
    }

    //performs an FFT on the buffer[N] and returns the result as {magnitude:array[n/2],phase:array[n/2]}
    getFFT = (buffer)=>{  
        if (buffer.length!=N)  return null;
        
        const fr = buffer.slice();
        const fi = new Array(N).fill(0);
        for(let i=0;i<bitReversals.length;i++){
            const br = bitReversals[i];
            const m = br[0];
            const mr = br[1];
            const tr = fr[m];
            fr[m] = fr[mr];
            fr[mr] = tr;
            //don't need to swap fi as it is all 0
        }
        

        //From https://vanhunteradams.com/FFT/FFT.html#Generalized-code
        //who referenced om Roberts 11/8/89 and Malcolm Slaney 12/15/94 malcolm@interval.com
        let L=1;
        let k=logN-1;
        while (L<N){
            let iStep = L*2;
            for(let m=0;m<L;m++){
                const theta = m<<k;
                const wr = sinLUT[theta+N_4];//cosine * 0.5 in LUT
                const wi = -sinLUT[theta];//sine * 0.5 in LUT
                for(let i=m;i<N;i+=iStep){
                    const j=i+L;
                    let tr = wr*fr[j]-wi*fi[j];
                    let ti = wr*fi[j]+wi*fr[j];
                    let qr = fr[i]*0.5;
                    let qi = fi[i]*0.5;
                    fr[j] = qr-tr;
                    fi[j] = qi-ti;
                    fr[i] = qr+tr;
                    fi[i] = qi+ti;
                }
            }
            k-- ;
            L = iStep ;
        }

        let mag=[];
        let phase=[];
        for(let i=0;i<N/2;i++){
            const x=fr[i];
            const y=fi[i];
            const m = Math.sqrt(x*x+y*y);
            mag.push(m);
            phase.push(m>zeroLevel? Math.atan2(y,x):0);
        }
        return {
            magnitude: mag,
            phase: phase
        }
    }
}

initFFT();