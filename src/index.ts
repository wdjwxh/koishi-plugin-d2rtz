import { Context, Schema, h } from 'koishi'
import { getTzInfo } from './fetch'

export const name = 'd2rtz'

export interface Config {
  apiUrl?: string
  ocrApiUrl: string
  aiApiUrl: string
  aiApiKey: string
  aiModel: string
  mockMode: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    apiUrl: Schema.string().description('API地址').default('https://api.d2-trade.com.cn/api/query/tz_online'),
  }).description('基础设置'),
  Schema.object({
    ocrApiUrl: Schema.string().description('OCR API地址').default('https://dashscope.aliyuncs.com/api/v1/services/ocr/general-ocr'),
    aiApiUrl: Schema.string().description('AI API地址').default('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'),
    aiApiKey: Schema.string().description('AI API密钥').role('secret'),
    aiModel: Schema.string().description('AI模型名称').default('qwen-plus'),
    mockMode: Schema.boolean().description('是否启用Mock模式（用于本地测试）').default(false)
  }).description('装备鉴定设置'),
])

// OCR识别函数
async function recognizeImage(ctx: Context, config: Config, imageUrl: string): Promise<{ success: boolean; text?: string; error?: string }> {
  ctx.logger.info(`开始OCR识别图片: ${imageUrl}`);

  // 如果启用了Mock模式，则返回预设的模拟数据
  if (config.mockMode) {
    ctx.logger.info('使用Mock模式进行OCR识别');
    
    // 模拟OCR识别延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 返回模拟的OCR识别结果
    return { 
      success: true, 
      text: `暗黑破坏神装备信息：
力量 +15
敏捷 +10
最大生命值 +20
防御 +50
等级需求 25
稀有度：魔法物品` 
    };
  }

  try {
    const response = await fetch(config.ocrApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageUrl,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `OCR请求失败: ${response.status} ${response.statusText}` };
    }

    const result = await response.json();
    ctx.logger.info(`OCR识别结果: ${JSON.stringify(result)}`);

    // 提取OCR识别的文字内容
    // 这里需要根据实际OCR API的返回格式进行解析
    const ocrText = result.text || '无法提取OCR文本';

    return { success: true, text: ocrText };
  } catch (error) {
    return { success: false, error: `OCR识别出错: ${error.message}` };
  }
}

// AI分析函数
async function analyzeItem(ctx: Context, config: Config, ocrText: string): Promise<{ success: boolean; analysis?: string; error?: string }> {
  ctx.logger.info(`开始AI分析装备: ${ocrText}`);

  // 如果启用了Mock模式，则返回预设的模拟数据
  if (config.mockMode) {
    ctx.logger.info('使用Mock模式进行AI分析');
    
    // 模拟AI分析延迟
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 返回模拟的AI分析结果
    return { 
      success: true, 
      analysis: '这是一件中级魔法装备，属性较为普通。力量和敏捷的加成对近战职业有一定帮助，但整体属性并不突出。建议作为过渡装备使用，不建议长期保留。' 
    };
  }

  try {
    const prompt = `你是一个暗黑破坏神游戏专家，你将收到一段OCR识别的装备属性文本，请分析这个装备的价值并给出简要评价，回复控制在200字以内。装备信息：${ocrText}`;

    const response = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.aiApiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Model': config.aiModel,
      },
      body: JSON.stringify({
        model: config.aiModel,
        input: {
          prompt: prompt,
        },
        parameters: {
          max_tokens: 200,
        }
      }),
    });

    if (!response.ok) {
      return { success: false, error: `AI分析请求失败: ${response.status} ${response.statusText}` };
    }

    const result = await response.json();
    ctx.logger.info(`AI分析结果: ${JSON.stringify(result)}`);

    // 提取AI分析结果
    // 根据实际API返回格式进行解析
    const analysis = result.output?.text || '无法获取AI分析结果';

    return { success: true, analysis };
  } catch (error) {
    return { success: false, error: `AI分析出错: ${error.message}` };
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.command('d2rtz')
    .action(async ({ session }) => {
      try {
        const info = await getTzInfo(config);
        return info;
      } catch (error) {
        return '获取TZ信息失败: ' + error.message;
      }
    })

  // 装备鉴定指令
  ctx.command('鉴定 <image:text>', '暗黑破坏神装备鉴定')
    .option('mock', '-m 使用Mock模式进行测试')
    .action(async ({ session }, image) => {
      let src = (h.select(image, 'img').map(item => item.attrs.src)[0] ||
        h.select(session.quote?.content, "img").map((a) => a.attrs.src)[0] ||
        h.select(session.quote?.content, "mface").map((a) => a.attrs.url)[0]);

      if (!src) {
        const [msgId] = await session.send(`请在30秒内发送装备截图`);
        const promptcontent = await session.prompt(30000);
        if (promptcontent !== undefined) {
          src = h.select(promptcontent, 'img')[0]?.attrs.src || h.select(promptcontent, 'mface')[0]?.attrs.url;
        }
        try {
          await session.bot.deleteMessage(session.channelId, msgId);
        } catch {
          ctx.logger.warn(`在频道 ${session.channelId} 尝试撤回消息ID ${msgId} 失败。`);
        }
      }

      if (!src) {
        return '未检测到有效的装备截图，请重新发送。';
      }

      ctx.logger.info(`用户发送的装备截图链接: ${src}`);

      // OCR识别
      const ocrResult = await recognizeImage(ctx, config, src);

      if (!ocrResult.success) {
        return `装备属性识别失败: ${ocrResult.error}`;
      }

      // AI分析
      const analysisResult = await analyzeItem(ctx, config, ocrResult.text);

      if (!analysisResult.success) {
        return `装备价值分析失败: ${analysisResult.error}`;
      }

      // 返回结果
      return analysisResult.analysis;
    });
}
