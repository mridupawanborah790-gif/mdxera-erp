
export const renderBarcode = (element: HTMLElement | SVGSVGElement | HTMLCanvasElement | null, value: string) => {
    if (!element || !value) return;
    
    // Small timeout to ensure DOM element is ready and ref is populated
    setTimeout(() => {
        try {
            // @ts-ignore
            if (typeof window !== 'undefined' && window.JsBarcode) {
                // @ts-ignore
                window.JsBarcode(element, value, {
                    format: "CODE128",
                    lineColor: "#000",
                    width: 2,
                    height: 40,
                    displayValue: true,
                    fontSize: 14,
                    margin: 10,
                    background: "#ffffff"
                });
            } else {
                console.error("JsBarcode library not found on window object. Ensure the script is loaded in index.html.");
            }
        } catch (e) {
            console.error("Failed to render barcode:", e);
        }
    }, 50);
};

export const generateRandomBarcode = (): string => {
    // Generate a random 12-digit number. Using Date.now() + random to ensure uniqueness and validity.
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    const random = Math.floor(100000 + Math.random() * 900000).toString(); // 6 random digits
    return timestamp + random;
};
