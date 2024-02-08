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
//Code to implement a simple speaker model - to provide frequency dependent distortion
//
//Basic differential equation from: (via Kippel's work)
//https://repository.library.northeastern.edu/files/neu:336724/fulltext.pdf p5  Pascal Brunet
//And followed suggestion of using Duffing oscillator as a an example of this type of system
//One key Kippel sources:
//https://www.klippel.de/fileadmin/_migrated/content_uploads/Loudspeaker_Nonlinearities%E2%80%93Causes_Parameters_Symptoms_01.pdf
//
//Discretising differential equations:
//https://en.wikipedia.org/wiki/Euler_method used particularly higher order method example
//https://en.wikipedia.org/wiki/Newton%27s_method used particularly higher order method example
//https://people.sc.fsu.edu/~jpeterson/IVP.pdf for background
//
//Also, Art of Filter Design - integration, discretisation and Newtons method:
//https://www.native-instruments.com/fileadmin/ni_media/downloads/pdf/VAFilterDesign_2.1.2.pdf?sscid=11k8_zwuzf
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Model - Duffing Oscillator
// m.dy^2/dt^2 + r.dy/dt + k (1 - q y^2) y = x(t)
//
//  dy2/dt2 = y2(t)
//  dy/dt = y1(t)
//  y = y(t)
//  x = x(t)
//  y2 = 1/m( x - r y1 - k (1 - q y^2) y) = f(t,y1, y)
//  y2(t)= x(t) - r y1(t) - k (1 - q y(t)^2) y(t) = f(t,y1, y)
// 
// Euler's method for higher orders (wikipedia)
// y1t1 = y1t0 + h (y2t0) = y1t0 + h/m (xt0 - r y1t0 - k (1 - q yt0^2) yt0




function doSpeakerSim(buffer, sampleRate, patch, isCyclic){
    let length = buffer.length;


    //Duffing Oscillator - https://repository.library.northeastern.edu/files/neu:336724/fulltext.pdf p23
    //Values taken from reference
    // const m = 14;//g
    // const r = 0.78;//N.s/m
    // const k = 0.0005;//N/m
    // const q2 = 333000;
    const m = 1;//g
    const r = 0;//N.s/m
    const k = 0;//N/m
    const q2 = 0;
    //Resomant frequency = 1/2pi sqrt(k/m - r^2/4m^2)

    const invM = 1/m;
    const h = 0.001//sampleRate;
    const invMh = invM * h;

    //State Vector- initial conditions
    let y2t0 = 0;//Second derivative of y at t=0
    let y1t0 = 0;//First derivative of y at t=0
    let y0t0 = 0;//y at t=0

    //-4 to preload state vector
    for(let i=-4; i<length; i++){
        let assign=false;
        let xt0 = 0; //excitation at t=0
        if (i>=0) {
            xt0 = buffer[i];
            assign=true;
        }
        else if (isCyclic){
            xt0 = buffer[i+length];
        }

        const y2t1 = y2t0 + invMh *(xt0 - r * y1t0 - k * (1 - q2 * y0t0 * y0t0) * y0t0) ;
        const y1t1 = y1t0 + h * y2t0;
        const y0t1 = y0t0 + h * y1t0; 

        //if (assign) buffer[i] = y0t1;
        if (assign) buffer[i] = y1t1;


        y2t0 = y2t1;
        y1t0 = y1t1;
        y0t0 = y0t1;

    }


}