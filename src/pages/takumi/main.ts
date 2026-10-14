import '../../ui/base.css'
import { byId } from '../../ui/dom'
import { mountTallyApp } from '../../ui/tally-app'
import { takumi } from './config'

mountTallyApp(byId('app'), takumi)
