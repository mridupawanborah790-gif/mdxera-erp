
/**
 * Looks up district and state based on a given Indian pincode.
 * @param pincode The 6-digit Indian pincode.
 * @returns A promise that resolves to an object with district and state, or null if not found/error.
 */
export const lookupPincode = async (pincode: string) => {
    if (!pincode || pincode.length !== 6) return null;
    try {
        const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
        const data = await response.json();
        if (data[0] && data[0].Status === 'Success') {
            const detail = data[0].PostOffice[0]; // Take the first post office detail
            return {
                district: detail.District,
                state: detail.State
            };
        }
    } catch (e) {
        console.error("Pincode lookup error:", e);
    }
    return null;
};
