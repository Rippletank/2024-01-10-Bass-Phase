let isDarkMode = localStorage.getItem('isDarkMode') === 'true';
export function toLightMode(body, toLightMode){
    body = body ?? document.body;
    if (toLightMode) {
        isDarkMode = false;
        body.setAttribute('data-theme', 'light');
    } else {
        isDarkMode = true;
        body.setAttribute('data-theme', 'dark');
    }
    localStorage.setItem('isDarkMode', isDarkMode);
    return isDarkMode;
}
    
toLightMode(null, !isDarkMode)

export function getColor(r,g,b){
    return isDarkMode ?`rgb(${255-r},${255-g},${255-b})` : `rgb(${r},${g},${b})`;
}
export function getColorA(r,g,b,alpha){
    return isDarkMode ?`rgba(${255-r},${255-g},${255-b},${alpha})` : `rgba(${r},${g},${b},${alpha})`;
}
export function getGreyColorA(shade, alpha){
    return isDarkMode ? `rgba(${255-shade},${255-shade},${255-shade},${alpha})` : `rgba(${shade},${shade},${shade},${alpha})`;
}