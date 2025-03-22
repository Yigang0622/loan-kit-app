'use client'

import { useState } from 'react'
import { Input, Select, Radio, DatePicker, Button, Table } from 'antd'
import type { DatePickerProps } from 'antd'
import type { RadioChangeEvent } from 'antd'
import dayjs from 'dayjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js'
import { Line } from 'react-chartjs-2'

// 注册 ChartJS 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

interface LoanData {
  loanAmount: number
  loanTerm: number
  interestRate: number
  paymentMethod: 'equal-principal' | 'equal-installment'
  firstPaymentDate: string | null
  prepaymentDate: string | null
  prepaymentAmount: number
}

interface PaymentRecord {
  key: string
  month: string
  type: '原始' | '提前还款'
  payment: number
  interest: number
  principal: number
  remainingPrincipal: number
  specificDate?: string
  isStartPrepayment?: boolean
}

interface ComparisonData {
  original: PaymentRecord[]
  afterPrepayment: PaymentRecord[]
  combined: PaymentRecord[]
}

export default function PrepaymentPage() {
  const [loanData, setLoanData] = useState<LoanData>({
    loanAmount: 100, // 默认100万
    loanTerm: 30,    // 默认30年
    interestRate: 3.5,
    paymentMethod: 'equal-principal',
    firstPaymentDate: null,
    prepaymentDate: null,
    prepaymentAmount: 0
  })
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null)

  const handleInputChange = (field: keyof LoanData, value: any) => {
    setLoanData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleDateChange = (field: 'firstPaymentDate' | 'prepaymentDate'): DatePickerProps['onChange'] => {
    return (date, dateString) => {
      handleInputChange(field, dateString)
    }
  }

  // 计算月供（等额本息）
  const calculateMonthlyPayment = (principal: number, annualRate: number, years: number) => {
    const monthlyRate = annualRate / 100 / 12
    const totalMonths = years * 12
    return (principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / 
           (Math.pow(1 + monthlyRate, totalMonths) - 1)
  }

  // 计算等额本金每月还款额
  const calculatePrincipalPayment = (principal: number, years: number) => {
    const totalMonths = years * 12
    return principal / totalMonths
  }

  // 生成还款计划
  const generatePaymentSchedule = (
    principal: number,
    annualRate: number,
    years: number,
    prepaymentAmount: number = 0,
    prepaymentMonth: number = 0,
    startDate: string | null = null
  ): PaymentRecord[] => {
    const monthlyRate = annualRate / 100 / 12
    const totalMonths = years * 12
    const schedule: PaymentRecord[] = []
    let remainingPrincipal = principal
    
    // 计算起始日期
    const baseDate = startDate ? dayjs(startDate) : null

    // 根据还款方式确定每月应还本金
    const isEqualInstallment = loanData.paymentMethod === 'equal-installment'
    let monthlyPayment = isEqualInstallment ? 
      calculateMonthlyPayment(principal, annualRate, years) :
      calculatePrincipalPayment(principal, years)

    for (let month = 1; month <= totalMonths; month++) {
      const specificDate = baseDate ? 
        baseDate.add(month - 1, 'month').format('YYYY年M月') : 
        ''

      const isStartPrepayment = month === prepaymentMonth && prepaymentAmount > 0

      if (isStartPrepayment) {
        // 提前还款
        remainingPrincipal -= prepaymentAmount

        // 重新计算剩余期数
        const remainingYears = years - Math.floor((month - 1) / 12)
        const remainingMonths = remainingYears * 12 - ((month - 1) % 12)

        if (isEqualInstallment) {
          // 等额本息：重新计算月供
          monthlyPayment = calculateMonthlyPayment(remainingPrincipal, annualRate, remainingYears)
        } else {
          // 等额本金：重新计算每月应还本金
          monthlyPayment = calculatePrincipalPayment(remainingPrincipal, remainingYears)
        }
      }

      // 计算当月利息
      const interest = remainingPrincipal * monthlyRate

      let principal: number
      let payment: number

      if (isEqualInstallment) {
        // 等额本息
        payment = monthlyPayment
        principal = payment - interest
      } else {
        // 等额本金
        principal = monthlyPayment
        payment = principal + interest
      }

      // 更新剩余本金
      remainingPrincipal = Math.max(0, remainingPrincipal - principal)

      schedule.push({
        key: month.toString(),
        month: `第${month}月`,
        specificDate,
        payment: Number(payment.toFixed(2)),
        interest: Number(interest.toFixed(2)),
        principal: Number(principal.toFixed(2)),
        remainingPrincipal: Number(remainingPrincipal.toFixed(2)),
        type: isStartPrepayment ? '提前还款' : '原始',
        isStartPrepayment
      })

      // 如果本金已还清，提前结束
      if (remainingPrincipal <= 0) {
        break
      }
    }

    return schedule
  }

  const columns = [
    { 
      title: '月份', 
      dataIndex: 'month', 
      key: 'month',
      render: (text: string, record: PaymentRecord) => (
        <div className={`flex items-center ${record.isStartPrepayment ? 'font-bold text-red-600' : ''}`}>
          <span>{text}</span>
          <span className="ml-2 text-gray-500">
            ({record.type})
          </span>
          <span className="ml-2 text-sm text-gray-400">
            {record.specificDate}
          </span>
        </div>
      )
    },
    { 
      title: '月供(元)', 
      dataIndex: 'payment', 
      key: 'payment',
      render: (value: number, record: PaymentRecord) => (
        <span className={
          record.isStartPrepayment ? 'font-bold text-red-600' :
          record.type === '提前还款' ? 'text-blue-600' : ''
        }>
          {value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
        </span>
      )
    },
    { 
      title: '利息(元)', 
      dataIndex: 'interest', 
      key: 'interest',
      render: (value: number, record: PaymentRecord) => (
        <span className={
          record.isStartPrepayment ? 'font-bold text-red-600' :
          record.type === '提前还款' ? 'text-blue-600' : ''
        }>
          {value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
        </span>
      )
    },
    { 
      title: '本金(元)', 
      dataIndex: 'principal', 
      key: 'principal',
      render: (value: number, record: PaymentRecord) => (
        <span className={
          record.isStartPrepayment ? 'font-bold text-red-600' :
          record.type === '提前还款' ? 'text-blue-600' : ''
        }>
          {value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
        </span>
      )
    },
    { 
      title: '剩余本金(元)', 
      dataIndex: 'remainingPrincipal', 
      key: 'remainingPrincipal',
      render: (value: number, record: PaymentRecord) => (
        <span className={
          record.isStartPrepayment ? 'font-bold text-red-600' :
          record.type === '提前还款' ? 'text-blue-600' : ''
        }>
          {value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}
        </span>
      )
    }
  ]

  const handleCalculate = () => {
    const principalInYuan = loanData.loanAmount * 10000
    const prepaymentInYuan = loanData.prepaymentAmount * 10000

    let prepaymentMonth = 0
    if (loanData.firstPaymentDate && loanData.prepaymentDate) {
      const firstPayment = dayjs(loanData.firstPaymentDate)
      const prepayment = dayjs(loanData.prepaymentDate)
      prepaymentMonth = prepayment.diff(firstPayment, 'month') + 1
    }

    // 生成原始还款计划，传入首次还款日期
    const originalSchedule = generatePaymentSchedule(
      principalInYuan,
      loanData.interestRate,
      loanData.loanTerm,
      0,
      0,
      loanData.firstPaymentDate
    )

    // 生成提前还款后的计划，传入首次还款日期
    const prepaymentSchedule = generatePaymentSchedule(
      principalInYuan,
      loanData.interestRate,
      loanData.loanTerm,
      prepaymentInYuan,
      prepaymentMonth,
      loanData.firstPaymentDate
    )

    // 合并两个计划的数据
    const combinedSchedule: PaymentRecord[] = []
    originalSchedule.forEach((original, index) => {
      combinedSchedule.push({
        ...original,
        key: `original-${index}`,
        type: '原始'
      })
      
      const prepayment = prepaymentSchedule[index]
      if (prepayment) {
        combinedSchedule.push({
          ...prepayment,
          key: `prepayment-${index}`,
          type: '提前还款'
        })
      }
    })

    setComparisonData({
      original: originalSchedule,
      afterPrepayment: prepaymentSchedule,
      combined: combinedSchedule
    })
  }

  // 添加图表数据生成函数
  const getChartData = (originalData: PaymentRecord[], prepaymentData: PaymentRecord[]) => {
    const labels = originalData.map(record => 
      record.specificDate || record.month
    )

    return {
      labels,
      datasets: [
        {
          label: '原始还款计划',
          data: originalData.map(record => record.remainingPrincipal),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          tension: 0.1
        },
        {
          label: '提前还款计划',
          data: prepaymentData.map(record => record.remainingPrincipal),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          borderDash: [5, 5],
          tension: 0.1
        }
      ]
    }
  }

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '剩余本金变化趋势'
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const value = context.raw.toLocaleString('zh-CN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })
            return `${context.dataset.label}: ${value}元`
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          maxTicksLimit: 12,
          callback: function(value: any, index: number): string {
            // 直接返回值的字符串形式
            return index % 12 === 0 ? String(value) : ''
          }
        }
      },
      y: {
        title: {
          display: true,
          text: '剩余本金(元)'
        },
        ticks: {
          callback: function(value: any): string {
            return (value / 10000).toFixed(0) + '万'
          }
        }
      }
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">提前还款计算器</h1>
        
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <label htmlFor="loanAmount" className="block text-sm font-medium text-gray-700 mb-2">
              贷款金额（万元）
            </label>
            <Input
              type="number"
              id="loanAmount"
              value={loanData.loanAmount}
              onChange={(e) => handleInputChange('loanAmount', Number(e.target.value))}
              placeholder="请输入贷款金额"
            />
          </div>

          <div>
            <label htmlFor="loanTerm" className="block text-sm font-medium text-gray-700 mb-2">
              贷款期限（年）
            </label>
            <Select
              value={loanData.loanTerm}
              onChange={(value) => handleInputChange('loanTerm', value)}
              style={{ width: '100%' }}
            >
              {Array.from({length: 30}, (_, i) => i + 1).map(year => (
                <Select.Option key={year} value={year}>{year}年</Select.Option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="interestRate" className="block text-sm font-medium text-gray-700 mb-2">
              贷款利率（%）
            </label>
            <Input
              type="number"
              id="interestRate"
              value={loanData.interestRate}
              onChange={(e) => handleInputChange('interestRate', Number(e.target.value))}
              step="0.01"
              placeholder="请输入贷款利率"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              还款方式
            </label>
            <Radio.Group
              value={loanData.paymentMethod}
              onChange={(e: RadioChangeEvent) => handleInputChange('paymentMethod', e.target.value)}
            >
              <Radio value="equal-principal">等额本金</Radio>
              <Radio value="equal-installment">等额本息</Radio>
            </Radio.Group>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              首次还款时间
            </label>
            <DatePicker
              value={loanData.firstPaymentDate ? dayjs(loanData.firstPaymentDate) : null}
              onChange={handleDateChange('firstPaymentDate')}
              style={{ width: '100%' }}
              placeholder="选择首次还款日期"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              提前还款时间
            </label>
            <DatePicker
              value={loanData.prepaymentDate ? dayjs(loanData.prepaymentDate) : null}
              onChange={handleDateChange('prepaymentDate')}
              style={{ width: '100%' }}
              placeholder="选择提前还款日期"
            />
          </div>

          <div>
            <label htmlFor="prepaymentAmount" className="block text-sm font-medium text-gray-700 mb-2">
              提前还款金额（万元）
            </label>
            <Input
              type="number"
              id="prepaymentAmount"
              value={loanData.prepaymentAmount}
              onChange={(e) => handleInputChange('prepaymentAmount', Number(e.target.value))}
              placeholder="请输入提前还款金额"
            />
          </div>

          <Button
            type="primary"
            block
            onClick={handleCalculate}
            className="mb-8"
          >
            计算
          </Button>
        </div>

        {comparisonData && (
          <div className="mt-8 space-y-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div style={{ height: '400px' }}>
                <Line 
                  data={getChartData(comparisonData.original, comparisonData.afterPrepayment)}
                  options={chartOptions}
                />
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">还款计划对比</h2>
              <Table 
                columns={columns} 
                dataSource={comparisonData.combined}
                scroll={{ x: true }}
                pagination={{ pageSize: 24 }}
                rowClassName={(record) => 
                  record.type === '提前还款' ? 'bg-blue-50' : ''
                }
              />
            </div>
          </div>
        )}
      </div>
    </main>
  )
} 