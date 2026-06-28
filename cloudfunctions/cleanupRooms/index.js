// 清理云函数：删除脏数据 + 超过10分钟无操作的房间
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  try {
    let cleaned = 0;
    let errors = [];
    const now = Date.now();
    const TEN_MINUTES = 10 * 60 * 1000;

    // 方法1：用 db.command.eq(null) 查询
    try {
      const res1 = await db.collection('rooms').where({
        roomNumber: _.eq(null)
      }).get();
      if (res1.data && res1.data.length > 0) {
        for (const doc of res1.data) {
          try {
            await db.collection('rooms').doc(doc._id).remove();
            cleaned++;
          } catch (e) {
            errors.push('删除失败: ' + doc._id + ' - ' + e.message);
          }
        }
      }
    } catch (e) {
      errors.push('查询null失败: ' + e.message);
    }

    // 方法2：获取所有记录，过滤并清理脏数据 + 超时房间
    try {
      const allDocs = await db.collection('rooms').limit(100).get();
      for (const doc of allDocs.data) {
        // 脏数据：roomNumber 为空
        if (!doc.roomNumber || doc.roomNumber === '' || doc.roomNumber === 'null' || doc.roomNumber === 'undefined') {
          try {
            await db.collection('rooms').doc(doc._id).remove();
            cleaned++;
          } catch (e) {
            // 可能已被方法1删除，忽略
          }
          continue;
        }

        // 超时清理：updatedAt 超过10分钟没有更新
        const docUpdatedAt = doc.updatedAt || 0;
        if (docUpdatedAt > 0 && (now - docUpdatedAt) > TEN_MINUTES) {
          try {
            await db.collection('rooms').doc(doc._id).remove();
            cleaned++;
            console.log('清理超时房间: ' + doc.roomNumber + ' (最后更新: ' + new Date(docUpdatedAt).toISOString() + ')');
          } catch (e) {
            errors.push('超时删除失败: ' + doc._id + ' - ' + e.message);
          }
        }
      }
    } catch (e) {
      errors.push('全量查询失败: ' + e.message);
    }

    // 获取剩余房间数
    const remaining = await db.collection('rooms').limit(100).count();

    return {
      success: true,
      message: '已清理 ' + cleaned + ' 条数据',
      cleaned: cleaned,
      remaining: remaining.total,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (err) {
    console.error('cleanupRooms error:', err);
    return { success: false, error: err.message };
  }
};