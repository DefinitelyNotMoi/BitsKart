// In fileUpload.js
const toBase64 = (file) => new Promise((resolve, reject) => {
  console.log('Starting file to base64 conversion');
  const reader = new FileReader();
  
  reader.onload = () => {
    console.log('File read successfully');
    resolve(reader.result);
  };
  
  reader.onerror = error => {
    console.error('FileReader error:', error);
    reject(new Error('Failed to read the file. Please try another image.'));
  };
  
  console.log('Reading file as DataURL');
  reader.readAsDataURL(file);
});

export const uploadImage = async (file) => {
  console.log('Uploading image:', file.name, 'Type:', file.type, 'Size:', file.size);
  
  try {
    if (!file) {
      throw new Error('No file provided');
    }
    
    // Check if file is an image
    if (!file.type.match('image.*')) {
      throw new Error('Please select an image file (JPEG, PNG, etc.)');
    }

    // Check file size (e.g., 2MB limit)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      throw new Error('Image size should be less than 2MB');
    }

    console.log('Converting image to base64...');
    const base64String = await toBase64(file);
    console.log('Base64 conversion successful');
    return base64String;
    
  } catch (error) {
    console.error('Error in uploadImage:', {
      error,
      message: error.message,
      stack: error.stack
    });
    throw error; // Re-throw to be caught by the caller
  }
};