//https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
//https://developer.chrome.com/blog/audio-worklet
class MyAudioProcessor extends AudioWorkletProcessor {
    constructor() {
      super();

      console.log("MushraPlayer constructor");
      this.numberOfOutputs = 0;
      this.numberOfOutputChannels = 0;
      this.outputBufferSize = 0;

      this.outBufferCount = 0;
      this.processCalls=0;
      this.playList = [];
      this.sounds = [];

      this.port.onmessage = (event)=>{
        const payload = event.data;
        switch (payload.type) {
            case "playSound":
                this.port.postMessage({type:"report", data:"Playing sound: "+payload.data.index});
                this.startPlayingSound(payload.data.index)
                this.port.postMessage({type:"playlist", data: this.playList.length});
            break;
            case "loadSounds":
                this.port.postMessage({type:"report", data:"Loading sounds: "+payload.data.sounds.length});
                this.loadSounds(payload.data.sounds);
                this.port.postMessage({type:"Sounds", data:this.sounds.length});
            break;
            case "report":
                //this.port.postMessage({type:"report", data:"Good"});
                //this.port.postMessage({type:"Outputs", data:this.numberOfOutputs});
                this.port.postMessage({type:"Channels", data:this.numberOfOutputChannels});
                this.port.postMessage({type:"BufferSize", data:this.outputBufferSize});
                this.port.postMessage({type:"Buffers", data: this.outBufferCount});
                this.port.postMessage({type:"processCalls", data: this.processCalls});
                //this.port.postMessage({type:"playlist", data: this.playList.length});
                this.playList.forEach((item,index)=>{
                    this.port.postMessage({type:"playList "+index + ' position=', data: item.position});
                    this.port.postMessage({type:"playList "+index + ' isDone=', data: item.isDone});
                    this.port.postMessage({type:"playList "+index + ' index=', data: item.index});
                });
                this.sounds.forEach((item,index)=>{
                    this.port.postMessage({type:"sound "+index, data: item ? item.length : 'null'});
                    if (item) item.forEach((chan, index)=> this.port.postMessage({type:"   channel "+index+" ", data: chan.length}));
                });
            break;

        }
      }
    }
    
    static get parameterDescriptors() {
        return [{
          name: 'sampleRate',
          defaultValue: 48000,
        },
        {
            name: 'decay',
            defaultValue: 0.1,
            minValue:0.01,
            maxValue:1,
        }
        ];}


    
    process(inputList, outputList, parameters) {
        const sampleRate = parameters.sampleRate??48000
        const decay = Math.max(0.001,parameters.decay??0.1);

        this.processCalls++;
        this.numberOfOutputs = outputList.length;
        this.numberOfOutputChannels = 0;
        this.outputBufferSize = 0;
        if (this.numberOfOutputs >0) {
            const firstOutput = outputList[0];
            this.numberOfOutputChannels = firstOutput.length;
            if (this.numberOfOutputChannels > 0) {
                const outs = [firstOutput[0], firstOutput[1]];
                this.outputBufferSize = firstOutput[0].length;
                this.processOutput(outs, sampleRate, decay, this.outputBufferSize);
                this.outBufferCount++;
            }
        }

      return true;
    }

    
    processOutput(buffers, sampleRate, decay, bufferLength){
        if (!this.sounds) return;

        const decayStep = 1/(sampleRate*decay);

        this.playList.forEach((item)=>{
            const sound = this.sounds[item.index];
            if (!sound || sound.length < 1) return;
            const b1 = sound[0];
            const b2 = sound[sound.length>1 ? 1:0];
            const bs = [b1, b2];
            for (let i=0; i<bufferLength; i++){
                if (item.isFading){
                    item.level -= decayStep;
                    if (item.level <= 0){
                        item.level = 0;
                        item.isFading = false;
                        item.isDone=true;
                        this.port.postMessage({type:"report", data:"Sound faded: "+item.index});  
                    }
                }
                if (item.isDone) break;
                let channel=0;
                buffers.forEach((buffer)=>{
                    buffer[i] += bs[channel][item.position]*item.level;
                    channel++;
                });  
                item.position++;
                if (item.position >= b1.length) {
                    item.isDone=true;     
                    this.port.postMessage({type:"report", data:"Sound done: "+item.index});      
                }
            }
        });

        this.playList = this.playList.filter((item)=>{
            return !item.isDone;
        });

    }

    startPlayingSound(index){
        this.playList.forEach((item)=>{
            item.isFading = true; 
        });
        this.playList.push({
            index: index,
            position: 0,
            level: 1
        });
    }

    loadSounds(sounds){
        this.sounds = new Array(sounds.length);
        sounds.forEach((sound,index) => {
            this.sounds[index] = sound;
        });
    }   



  }
  
  registerProcessor("mushraPlayer", MyAudioProcessor);