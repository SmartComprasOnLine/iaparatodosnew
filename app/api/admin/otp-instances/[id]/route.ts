
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// DELETE - Delete OTP instance
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const instanceId = params.id

    // First try to disconnect the instance from Evolution API
    try {
      const evolutionConfig = await prisma.systemConfig.findUnique({
        where: { key: 'evolution_api_config' }
      })

      if (evolutionConfig) {
        const config = evolutionConfig.value as any
        const instanceConfig = await prisma.systemConfig.findUnique({
          where: { key: `otp_instance_${instanceId}` }
        })

        if (instanceConfig) {
          const instance = instanceConfig.value as any
          
          // Try to delete from Evolution API
          const deleteUrl = config.apiUrl.endsWith('/') 
            ? `${config.apiUrl}instance/delete/${instance.instanceName}`
            : `${config.apiUrl}/instance/delete/${instance.instanceName}`
          
          await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'apikey': config.apiKey
            }
          })
        }
      }
    } catch (error) {
      console.warn('Warning: Could not delete instance from Evolution API:', error)
      // Continue with local deletion even if Evolution API deletion fails
    }

    // Delete from local database
    const deleted = await prisma.systemConfig.delete({
      where: { key: `otp_instance_${instanceId}` }
    })

    if (!deleted) {
      return NextResponse.json({ error: 'Instância não encontrada' }, { status: 404 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Instância deletada com sucesso'
    })

  } catch (error) {
    console.error('Error deleting OTP instance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
