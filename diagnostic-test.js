
const { PrismaClient } = require('@prisma/client')

async function runDiagnostics() {
  const prisma = new PrismaClient()
  
  try {
    console.log('🔍 DIAGNÓSTICO: Status da Instância OTP Central\n')
    console.log('Timestamp:', new Date().toISOString())
    console.log('=' * 60)

    // 1. Verificar configuração Evolution API
    console.log('\n1. Verificando configuração Evolution API...')
    const evolutionConfig = await prisma.systemConfig.findUnique({
      where: { key: 'evolution_api_config' }
    })

    if (!evolutionConfig) {
      console.log('❌ Evolution API não configurada')
      return
    }

    const evolutionData = evolutionConfig.value
    console.log('✅ Evolution API configurada')
    console.log('   URL:', evolutionData.apiUrl)
    console.log('   API Key:', evolutionData.apiKey ? '[CONFIGURADA]' : '[NÃO CONFIGURADA]')

    // 2. Verificar instância central
    console.log('\n2. Verificando instância central OTP...')
    const centralInstance = await prisma.systemConfig.findUnique({
      where: { key: 'otp_central_instance' }
    })

    if (!centralInstance) {
      console.log('❌ Instância central não existe')
      return
    }

    const instanceData = centralInstance.value
    console.log('✅ Instância central existe')
    console.log('   Nome:', instanceData.instanceName)
    console.log('   Status no DB:', instanceData.status)
    console.log('   Última verificação:', instanceData.lastStatusCheck)
    console.log('   Telefone:', instanceData.phoneNumber || '[NÃO CONFIGURADO]')

    // 3. Construir URL para teste
    const statusUrl = evolutionData.apiUrl.endsWith('/') 
      ? `${evolutionData.apiUrl}instance/status/${instanceData.instanceName}`
      : `${evolutionData.apiUrl}/instance/status/${instanceData.instanceName}`
    
    console.log('\n3. Testando chamada direta para Evolution API...')
    console.log('   URL construída:', statusUrl)

    try {
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionData.apiKey
        }
      })

      console.log('   Status HTTP:', response.status, response.statusText)

      if (response.ok) {
        const responseData = await response.json()
        console.log('✅ Resposta da Evolution API:')
        console.log('   Raw response:', JSON.stringify(responseData, null, 2))
        
        // Interpretar o status
        let evolutionStatus = 'unknown'
        if (responseData?.instance?.status) {
          evolutionStatus = responseData.instance.status
        } else if (responseData?.status) {
          evolutionStatus = responseData.status
        } else if (responseData?.state) {
          evolutionStatus = responseData.state
        }
        
        console.log('   Status na Evolution API:', evolutionStatus)
        console.log('   Telefone na Evolution API:', responseData?.instance?.phoneNumber || responseData?.phoneNumber || '[NÃO ENCONTRADO]')
        console.log('   Tem QR Code:', !!responseData?.qrcode)
        
        // Comparar com o que está no painel
        console.log('\n4. Comparação de Status:')
        console.log('   Painel Admin (DB):', instanceData.status)
        console.log('   Evolution API:', evolutionStatus)
        console.log('   Match?', instanceData.status === evolutionStatus ? '✅ SIM' : '❌ NÃO - AQUI ESTÁ O PROBLEMA!')
        
        if (instanceData.status !== evolutionStatus) {
          console.log('\n🚨 PROBLEMA IDENTIFICADO!')
          console.log('   O status no banco de dados está diferente do status na Evolution API.')
          console.log('   Isso explica a discrepância que você está vendo.')
          
          // Sugerir mapeamento correto
          let correctStatus = 'unknown'
          if (evolutionStatus === 'open') {
            correctStatus = 'connected'
          } else if (evolutionStatus === 'close') {
            correctStatus = 'disconnected'
          } else if (evolutionStatus === 'connecting') {
            correctStatus = 'connecting'
          } else if (evolutionStatus === 'qr') {
            correctStatus = 'qr_waiting'
          }
          
          console.log('   Status correto deveria ser:', correctStatus)
        }
        
      } else {
        console.log('❌ Erro na chamada da Evolution API')
        const errorText = await response.text()
        console.log('   Resposta de erro:', errorText)
      }

    } catch (apiError) {
      console.log('❌ Erro ao chamar Evolution API:', apiError.message)
    }

    // 5. Testar diferentes URLs
    console.log('\n5. Testando URLs alternativas...')
    const alternativeUrls = [
      `${evolutionData.apiUrl}/instance/connectionState/${instanceData.instanceName}`,
      `${evolutionData.apiUrl}/instance/info/${instanceData.instanceName}`,
      `${evolutionData.apiUrl.replace(/\/$/, '')}/instance/status/${instanceData.instanceName}`,
    ]

    for (const url of alternativeUrls) {
      try {
        console.log('   Testando:', url)
        const testResponse = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionData.apiKey
          }
        })
        console.log('     Status:', testResponse.status, testResponse.statusText)
        
        if (testResponse.ok) {
          const testData = await testResponse.json()
          console.log('     Resposta válida encontrada!')
          console.log('     Data:', JSON.stringify(testData, null, 2))
        }
      } catch (err) {
        console.log('     Erro:', err.message)
      }
    }

  } catch (error) {
    console.error('Erro geral:', error)
  } finally {
    await prisma.$disconnect()
  }
}

runDiagnostics()
