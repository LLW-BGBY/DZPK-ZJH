const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { limit = 5 } = event;

  try {
    const now = Date.now();
    const res = await db.collection('announcements')
      .where({
        enabled: true,
        startTime: _.lte(now),
        endTime: _.gte(now)
      })
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit) || 5)
      .get();

    return { success: true, data: res.data || [] };
  } catch (err) {
    console.error('getAnnouncements error:', err);
    return { success: false, error: err.message };
  }
};
