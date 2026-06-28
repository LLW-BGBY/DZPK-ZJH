const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { fileList } = event;
  if (!fileList || !Array.isArray(fileList) || fileList.length === 0) {
    return { success: false, error: '参数无效' };
  }

  try {
    const res = await cloud.getTempFileURL({ fileList });
    return {
      success: true,
      fileList: res.fileList.map(item => ({
        fileID: item.fileID,
        tempFileURL: item.tempFileURL || '',
        status: item.status
      }))
    };
  } catch (err) {
    console.error('batchGetTempUrls error:', err);
    return { success: false, error: err.message };
  }
};