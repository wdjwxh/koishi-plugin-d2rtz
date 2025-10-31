import areas from './areas';
import fs from 'fs';
import path from 'path';

// 定义配置接口
interface Config {
  apiUrl?: string;
  groupId?: string;
  authToken?: string;
  sendMessageUrl?: string;
}

// 执行请求的函数
async function fetchTzOnline(config?: Config) {
  // 确定缓存目录路径（相对于当前文件）
  const cacheDir = path.join(__dirname, '../cache');
  const cacheFile = path.join(cacheDir, 'tz_online.json');
  
  // 确保缓存目录存在
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  // 检查是否存在有效的缓存（30分钟内且在整点前有效）
  if (fs.existsSync(cacheFile)) {
    const cacheStat = fs.statSync(cacheFile);
    const now = new Date();
    const cacheTime = cacheStat.mtime;
    
    // 检查是否在同一小时内且缓存时间在30分钟内
    const isSameHour = now.getHours() === cacheTime.getHours() && 
                      now.getDate() === cacheTime.getDate() && 
                      now.getMonth() === cacheTime.getMonth() && 
                      now.getFullYear() === cacheTime.getFullYear();
    
    const timeDiff = now.getTime() - cacheTime.getTime();
    const isWithin30Minutes = timeDiff < 30 * 60 * 1000;
    
    // 如果缓存文件在30分钟内且仍在同一小时内，则直接返回缓存内容
    if (isWithin30Minutes && isSameHour) {
      const cachedData = fs.readFileSync(cacheFile, 'utf8');
      return JSON.parse(cachedData);
    }
  }
  
  // 没有有效缓存，发起网络请求
  const url = config?.apiUrl || "https://api.d2-trade.com/api/query/tz_online";
  const response = await fetch(url, {
    "headers": {
      "accept": "application/json",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,es;q=0.7,ee;q=0.6",
      "priority": "u=1, i",
      "sec-ch-ua": "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "Referer": "https://www.d2-trade.com/"
    },
    "body": null,
    "method": "GET"
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const data = await response.json();
  
  // 将响应数据写入缓存文件
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
  
  return data;
}

// 发送群组消息的函数
function sendGroupMessage(text: string, config?: Config) {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("Authorization", `Bearer ${config?.authToken || "abc"}`); // 添加Bearer Token认证

  const raw = JSON.stringify({
    "group_id": config?.groupId || "1026709881",
    "message": [
      {
        "type": "text",
        "data": {
          "text": text
        }
      }
    ]
  });

  const requestOptions: RequestInit = {
    method: 'POST',
    headers: myHeaders,
    body: raw,
    redirect: 'follow'
  };

  // 使用完整的URL地址
  const sendMessageUrl = config?.sendMessageUrl || "http://example.message.com/send_group_msg";
  return fetch(sendMessageUrl, requestOptions)
    .then(response => response.text())
    .then(result => {
      console.log('Message sent successfully:', result);
      return result;
    })
    .catch(error => {
      console.log('Error sending message:', error);
      throw error;
    });
}

// 处理响应数据并生成提示语的函数
function processTzOnlineData(data: any) {
  console.log('Received data:', JSON.stringify(data, null, 2)); // 添加日志，显示完整数据
  
  if (!data || !data.data || !Array.isArray(data.data) || data.data.length < 2) {
    throw new Error('Invalid data format');
  }

  // 按照时间排序数据
  const sortedData = data.data.sort((a, b) => a.time - b.time);
  
  // 第一个是当前区域，第二个是下一个区域
  const currentZoneData = sortedData[0];
  const nextZoneData = sortedData[1];
  
  const currentZoneId = currentZoneData.zone;
  const nextZoneId = nextZoneData.zone;
  
  console.log('Current zone ID:', currentZoneId); // 添加日志，显示当前zoneId
  console.log('Next zone ID:', nextZoneId); // 添加日志，显示下一个zoneId
  
  // 根据zone_id查找区域信息
  const currentAreaInfo = areas[currentZoneId];
  const nextAreaInfo = areas[nextZoneId];
  
  if (!currentAreaInfo) {
    throw new Error(`Area info not found for current zone: ${currentZoneId}`);
  }
  
  if (!nextAreaInfo) {
    throw new Error(`Area info not found for next zone: ${nextZoneId}`);
  }
  
  // 组装提示语
  const message = `TZ：${currentAreaInfo.name}，掉落：${currentAreaInfo.tier}\n` +
                  `Next：${nextAreaInfo.name}，掉落：${nextAreaInfo.tier}`;
  
  return message;
}

// 主函数
async function main(config?: Config) {
  try {
    const data = await fetchTzOnline(config);
    const message = processTzOnlineData(data);
    
    // 输出到控制台
    console.log(message);
    
    // 发送群组消息
    await sendGroupMessage(message, config);
    
    return message;
  } catch (error) {
    console.error('Error occurred during fetch:', error);
    throw error;
  }
}

// 导出函数供外部调用
export {
  fetchTzOnline,
  processTzOnlineData,
  sendGroupMessage,
  main,
  getTzInfo
};

// 新增函数：获取并返回TZ信息
async function getTzInfo(config?: Config) {
  try {
    const data = await fetchTzOnline(config);
    return processTzOnlineData(data);
  } catch (error) {
    console.error('Error occurred during fetch:', error);
    throw error;
  }
}