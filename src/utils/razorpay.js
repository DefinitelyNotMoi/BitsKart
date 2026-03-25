const RAZORPAY_SCRIPT_ID = "razorpay-checkout-js";
const RAZORPAY_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise = null;

const ensureDocument = () => typeof document !== "undefined";

export function loadRazorpayScript() {
  if (!ensureDocument()) return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById(RAZORPAY_SCRIPT_ID);
      if (existingScript) {
        existingScript.onload = () => resolve(true);
        existingScript.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
        return;
      }

      const script = document.createElement("script");
      script.id = RAZORPAY_SCRIPT_ID;
      script.src = RAZORPAY_SRC;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
      document.body.appendChild(script);
    });
  }

  return scriptPromise;
}

export async function openRazorpayCheckout(options = {}) {
  if (!options.key) throw new Error("Razorpay key id is required");

  const isLoaded = await loadRazorpayScript();
  if (!isLoaded) throw new Error("Unable to load Razorpay checkout");

  return new Promise((resolve, reject) => {
    try {
      let hasSettled = false;
      const { handler: userHandler, modal: userModal, ...restOptions } = options;

      const razorpayInstance = new window.Razorpay({
        theme: { color: "#0f172a" },
        ...restOptions,
        handler: (response) => {
          if (hasSettled) return;
          hasSettled = true;
          userHandler?.(response);
          resolve(response);
        },
        modal: {
          ...(userModal || {}),
          ondismiss: () => {
            userModal?.ondismiss?.();
            if (!hasSettled) {
              hasSettled = true;
              reject(new Error("Payment popup closed"));
            }
          },
        },
      });

      razorpayInstance.on("payment.failed", (event) => {
        if (hasSettled) return;
        hasSettled = true;
        reject(event?.error || new Error("Payment failed"));
      });

      razorpayInstance.open();
    } catch (error) {
      reject(error);
    }
  });
}
