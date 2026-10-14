import '../../ui/base.css'
import { byId } from '../../ui/dom'
import { mountWorkReportApp } from '../../ui/work-report-app'
import { kinmu } from './config'

mountWorkReportApp(byId('app'), kinmu)
