export const parseDataURI = (dataURI: string) => {
  const validData = dataURI.match(/data:([-\w]+\/[-+\w.]+)?(;?\w+=[-\w]+)*(;base64)?,(.+)$/s);

  if (validData && validData.length >= 5) {
    return {
      mimetype: validData[1],
      isBase64: validData[3]?.toLocaleLowerCase() === ";base64",
      data: validData[4],
    };
  }

  return { mimetype: null, isBase64: false, data: null };
};
